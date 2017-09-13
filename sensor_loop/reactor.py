# -*- encoding: utf-8 -*-
import gevent
from gevent import monkey
monkey.patch_all()
import redis
import json
import time
import logging
import signal
import platform
import datetime
import RPi.GPIO as GPIO
HEATER_PIN = 11

"""
r.publish('rchouse:broadcast:commands', '{"type": "user_values", "sensors": {"1": {"max_value": 26, "min_value": 20, "max_action": ["heater_off"], "min_action": ["heater_on", "telegram"]}, "2": 31} }')
r.publish('rchouse:broadcast:commands', '{"type": "current_values", "sensors": {"1": 28, "2": 31} }')
"""

class Reactor(object):

    def __init__(self, r, channels):
        self.redis = r
        self.pubsub = self.redis.pubsub()
        self.pubsub.subscribe(channels)
        self.user_values = {}
        self.current_values = {}
        self.EXIT_ALL_THREADS = False
        self.heater_on = False

        # инициализируем переменные из редиса
        data = self.redis.get('user_values')
        try:
            self.user_values.update( json.loads(data).get('sensors', None) )
        except TypeError:
            logging.warning('Could not retrieve init user_values from redis')

        data = self.redis.get('current_values')
        try:
            self.current_values.update( json.loads(data).get('sensors', None) )
        except TypeError:
            logging.warning('Could not retrieve init current_values from redis')
        
        # запускаем два бесконечных цикла: проверку ивентов из редиса и сравнение заданной температуры с текущей
        threads = [gevent.spawn(self.async_subscriber), gevent.spawn(self.async_reactor, 0.01)]
        gevent.joinall(threads)

    def async_subscriber(self):
        # на событие обновляем волатильную переменную с температурой + записываем в redis
        try:
            for item in self.pubsub.listen():
                try:
                    data = json.loads(item['data'])
                    if data.get('type', None) == 'user_values':
                        user_values = data.get('sensors', None)
                        self.user_values.update(user_values)
                        self.redis.set('user_values', json.dumps(data))
                    elif data.get('type', None) == 'current_values':
                        current_values = data.get('sensors', None)
                        self.current_values.update(current_values)
                        self.redis.set('current_values', json.dumps(data))
                except ValueError, e:
                    logging.debug('{}'.format(e))
                except TypeError, e:
                    logging.debug('{}'.format(e))
                    
                if self.EXIT_ALL_THREADS:
                    break
                gevent.sleep(0)
        except Exception:
            # исключительная ситуация потери соединения с редисом:
            # убиваем все гринтреды, выкидываем исключение, снаружи его ловим и пересоздаём объект
            self.EXIT_ALL_THREADS = True
            raise

    def async_reactor(self, delay=1):
        try:
            # сравниваем user_values и current_values, запускаем действия
            while True:
                # используем копии словарей, потому что в действиях может случиться свитч на async_subscriber
                local_user_values = self.user_values.copy()
                local_current_values = self.current_values.copy()

                for uk, uv in local_user_values.iteritems():
                    if not isinstance(uv, dict):
                        continue
                    curval = local_current_values.get(uk, None)
                    if not isinstance(curval, (int, long, float)):
                        continue
                    if curval:
                        if curval < uv.get("min_value", curval) and not self.heater_on:
                            self.heater_on = True
                            self.perform_actions(uv.get("min_action", []))
                        elif curval > uv.get("max_value", curval) and self.heater_on:
                            self.heater_on = False
                            self.perform_actions(uv.get("max_action", []))
                if self.EXIT_ALL_THREADS:
                    break
                gevent.sleep(delay)
        except Exception:
            # исключительная ситуация:
            # убиваем все гринтреды, выкидываем исключение, снаружи его ловим и пересоздаём объект
            self.EXIT_ALL_THREADS = True
            raise

    def perform_actions(self, action_list):
        # TODO: словарь команд:функций, из которого сразу вызывать функцию по её ключу -> подключаемые плагины обработки команд
        for action in action_list:
            self.redis.publish('rchouse:broadcast:status', '{"message": "%s"}' % action)
            if action == "heater_on":
                # пишем 1 в реле
                GPIO.output(HEATER_PIN, GPIO.HIGH)
                print "action: set relay to 1"
            elif action == "heater_off":
                # пишем 0 в реле
                GPIO.output(HEATER_PIN, GPIO.LOW)
                print "action: set relay to 0"
            elif action == "telegram":
                print "action: send telegram notification"
                heater_msg = '{"telegram": "W O W! Heater just turned %s!"}' % ('on' if self.heater_on else 'off')
                self.redis.publish('rchouse:broadcast:status', heater_msg)


if __name__ == "__main__":
    GPIO.setmode(GPIO.BOARD)
    GPIO.setup(HEATER_PIN, GPIO.OUT, initial=GPIO.LOW)
    if platform.system() == 'Windows':
        gevent.signal(signal.SIGTERM , gevent.kill)
    else:
        gevent.signal(signal.SIGQUIT, gevent.kill)

    logging.basicConfig(filename='reactor.log',level=logging.DEBUG, format='%(asctime)s %(message)s', datefmt='%d-%m-%Y %I:%M:%S %p')
    while True:
        try:
            r = redis.Redis()
            infinite_loop = Reactor(r, ['rchouse:broadcast:status', 'rchouse:broadcast:current_values', 'rchouse:broadcast:user_values'])
        except Exception, e:
            logging.error('Reactor gonna autorestart: {}'.format(e))
            time.sleep(5)
    GPIO.cleanup()