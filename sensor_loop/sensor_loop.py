# -*- encoding: utf-8 -*-
import time
from datetime import datetime
import gevent
from gevent import queue
import signal
#import random
#random.seed()
import platform
import redis
import json
import sqlite3
import logging
import pytz
from w1thermsensor import W1ThermSensor

# sensor.sqlite3 — БД с историей датчиков
# db.sqlite3 — БД веб-приложения
# redis — глобальные настройки, заданная температура, разрешённые иды телеграма

"""
class MockSensor(object):

    def __init__(self):
        self.id = "".join(random.choice("0123456789abcdef") for i in range(12))

    def get_temperature(self):
        return random.randint(20, 30)

class W1ThermSensor(object):

    @classmethod
    def get_available_sensors(cls):
        return [MockSensor() for i in xrange(0,4)]
"""

# инициализация сенсоров - увязка 64-битных идентификаторов устройств с id в БД
def init_sensors():
    result = {}
    conn = sqlite3.connect('../sensor.sqlite3')
    c = conn.cursor()
    try:
        for sensor in W1ThermSensor.get_available_sensors():
            logging.info('sensor found: %s' % sensor.id)
            db_id = c.execute(
                    'SELECT id FROM device WHERE device_id = ?', (sensor.id,)
            ).fetchone()
            if not db_id:
                c.execute('INSERT INTO device (device_id) values (?)', (sensor.id,))
                conn.commit()
                db_id = c.lastrowid
                logging.info('sensor %s added to db id=%s' % (sensor.id, db_id))
            else:
                db_id = db_id[0]
            result.update({db_id: sensor})

    except sqlite3.DatabaseError, e:
        conn.rollback()
        logging.error('fatal DatabaseError: %s' % str(e))
        # уведомление в телеграм?
    except Exception, e:
        logging.error('fatal error on sensor initialization: %s' % str(e))
        # уведомление в телеграм?
    conn.close()
    return result

def get_temp(id, func):
    result = func()
    queue.put({id: result})

def write_to_db(current_values):
    conn = sqlite3.connect('../sensor.sqlite3')
    c = conn.cursor()
    ts = int( time.mktime( datetime.now().timetuple() ) ) * 1000
    write_list = []
    try:
        for scale in [1, 5, 60, 1440, 44640]:
            # для scale=1 пишем сразу всё за раз, потому что для остальных скейлов в большинстве случаев
            # вообще ничего писать будет не надо, а где надо - эти значения должны быть учтены в среднем
            if scale == 1:
                for sensor_id, sensor_value in current_values.iteritems():
                    write_list.append((ts, sensor_id, sensor_value, scale))
                c.executemany('insert into sensor values (?,?,?,?)', write_list)
                conn.commit()
                write_list = []
                continue
            else:
                for sensor_id, sensor_value in current_values.iteritems():
                    last_created = c.execute('SELECT max(timestamp) '
                                             'FROM sensor '
                                             'WHERE sensor_id = %d AND scale = %d' % (sensor_id, scale)
                    ).fetchone()[0] or 0
                    last_created = int(last_created)
                    # если усреднённого времени не было, считаем среднее и вставляем
                    if (ts - last_created) >= scale * DUMP_PERIOD * 1000:
                        avg_val, max_ts = c.execute('SELECT avg(value), max(timestamp) '
                                                    'FROM ( '
                                                    '    SELECT value, timestamp '
                                                    '    FROM sensor '
                                                    '    WHERE sensor_id = %d AND scale = 1 '
                                                    '    ORDER BY timestamp DESC '
                                                    '    LIMIT %d '
                                                    ')' % (sensor_id, scale)
                        ).fetchone() or (0, 0)
                        avg_val, max_ts = round(avg_val, 3), int(max_ts)
                        write_list.append((max_ts, sensor_id, avg_val, scale))
        # вставляем разом для всех скейлов, кроме уже вставленного scale=1
        c.executemany('insert into sensor values (?,?,?,?)', write_list)
        conn.commit()
    except sqlite3.DatabaseError, e:
        conn.rollback()
        logging.error('fatal DatabaseError: %s' % str(e))
        # уведомление в телеграм?
    except Exception, e:
        logging.error('fatal error writing to db: %s' % str(e))
        # уведомление в телеграм?
    conn.close()

if __name__ == '__main__':
    logging.basicConfig(filename='sensor_loop.log',level=logging.DEBUG, format='%(asctime)s %(message)s', datefmt='%d-%m-%Y %I:%M:%S %p')
    DUMP_PERIOD = 60 # периодичность записи показаний в БД, являющаяся х1 масштабом (количество секунд в единице)
    user_values = {} # словарь для показаний датчиков, к которым нужно стремиться; key=id датчика
    queue = queue.Queue()

    if platform.system() == 'Windows':
        gevent.signal(signal.SIGTERM , gevent.kill)
    else:
        gevent.signal(signal.SIGQUIT, gevent.kill)

    # инициализация сенсоров, на выходе словарь {id: sensor}
    sensors = init_sensors()
    r = redis.Redis()

    beat_counter = 0
    # бесконечный цикл получения текущего состояния с датчиков
    while True:
        threads = [gevent.spawn(get_temp, sensor_id, sensor.get_temperature) for sensor_id, sensor in sensors.iteritems()]
        dt_before = datetime.now()
        gevent.joinall(threads, timeout=4)

        current_values = {}
        while not queue.empty():
            d = queue.get()
            current_values.update( d )

        # паблиш в канал 'rchouse:broadcast' редиса для отображения на странице через вебсокеты
        # r.publish('rchouse:broadcast', '{"type": "current_values", "sensors": {"1": 28, "2": 31} }')
        data = {"type": "current_values", "sensors": current_values, "time": str(datetime.now(pytz.utc).isoformat(' '))}
        r.publish('rchouse:broadcast:current_values', json.dumps(data))

        beat_counter += (datetime.now() - dt_before).total_seconds()
        if beat_counter >= DUMP_PERIOD:
            write_to_db(current_values)
            beat_counter = 0