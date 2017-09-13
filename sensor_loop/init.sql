create table device(id INTEGER PRIMARY KEY, device_id TEXT, name TEXT);
create table sensor(timestamp INTEGER NOT NULL, sensor_id INTEGER NOT NULL, value NUMERIC, scale INTEGER);
create index sensor_scale_1 on sensor(sensor_id asc, timestamp asc) where scale=1;
create index sensor_scale_5 on sensor(sensor_id asc, timestamp asc) where scale=5;
create index sensor_scale_60 on sensor(sensor_id asc, timestamp asc) where scale=60;
create index sensor_scale_1440 on sensor(sensor_id asc, timestamp asc) where scale=1440;
