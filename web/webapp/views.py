#!/usr/bin/python
# -*- coding: UTF-8 -*-

from django.shortcuts import render
from django.http import HttpResponse, HttpResponseRedirect
from django.contrib.auth.decorators import login_required
from django.db import connection
import sqlite3
import json
import time
from datetime import datetime
import logging
import redis

logger = logging.getLogger(__name__)

from ws4redis.redis_store import RedisMessage
from ws4redis.publisher import RedisPublisher
from redis_sessions.session import SessionStore

@login_required
def logout(request):
    session = SessionStore()
    session.delete(request.session.session_key)
    return HttpResponseRedirect('/admin/login/')

@login_required
def index(request):
    r = redis.Redis()
    user_values = RedisMessage( json.loads(r.get('user_values')) )
    RedisPublisher(facility='user_values`', broadcast=True).publish_message(user_values)


    conn = sqlite3.connect('../sensor.sqlite3')
    c = conn.cursor()
    data = []
    try:
        data = c.execute('SELECT id, name '
                         'FROM device '
        ).fetchall()
    except Exception, e:
        logger.error('get_json error: %s' % str(e))
    sensors = []
    for sensor in data:
        sensors.append( {"id": sensor[0], "name": sensor[1]} )

    return render(request, 'webapp.html', {"sensors": sensors})


@login_required
def get_json(request, sensor, start, end, scale):
    t1, t2 = time.time(), time.clock()
    # важно убедиться, что все аргументы — числа, т.к. не пользуемся байндингом
    # а не пользуемся им потому, что значение scale подставляется уже после того,
    # как планировщик выберет подходящие индексы, а значит partial index по scale не применится
    sensor, start, end, scale = int(sensor), int(start), int(end), int(scale)
    conn = sqlite3.connect('../sensor.sqlite3')
    c = conn.cursor()
    data = []
    try:
        data = c.execute('SELECT timestamp, value '
                         'FROM sensor '
                         'WHERE sensor_id = %d AND scale = %d AND timestamp BETWEEN %d AND %d' % (
            sensor, scale, start, end)
        ).fetchall()
    except Exception, e:
        logger.error('get_json error: %s' % str(e))
    logger.debug((len(data), time.time() - t1, time.clock() - t2))
    if len(data) == 1:
        # TODO: работа в разных часовых поясах -> utc и использование tz
        ts = int(time.mktime(datetime.now().timetuple())) * 1000
        data.append([ts, 0])
    serialized_data = json.dumps({'data': data})
    return HttpResponse(serialized_data, content_type="application/json")