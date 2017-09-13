(function() {
    $(document).ready(function () {
        var mySlider = $("input.slider").bootstrapSlider();

        $('.accordion-inner input').iCheck({
            handle: 'checkbox',
            checkboxClass: 'icheckbox_flat',
            increaseArea: '20%'
        });


        var billboard = $('#billboard');
        $("#text_message").keydown(function(event) {
            if (event.keyCode === 13) {
                event.preventDefault();
                ws_status.send_message($('#text_message').val());
            }
        });
        $('#send_message').click(function() {
            ws_status.send_message($('#text_message').val());
        });
        function receiveMessage(msg) {
            billboard.append('<br/>' + msg);
            billboard.scrollTop(billboard.scrollTop() + 25);

            var values = JSON.parse(msg);
            if (values.type === "current_values") {
                console.log(values.sensors);
                $.each(sensor_list, function () {
                    var sensor_val = values.sensors[this.id];
                    if (sensor_val !== undefined) {
                        var sign = sensor_val >= 0 ? '+' : '–';
                        this.setData(sign + sensor_val + '°C');
                    }
                });
            } else
            if (values.type === "user_values") {
                console.log(values.sensors);
                $.each(sensor_list, function () {
                    var sensor = values.sensors[this.id];
                    if (sensor !== undefined) {
                        this.setMax(sensor.max_value);
                        this.setMin(sensor.min_value);
                        this.setMinActions(sensor.min_action);
                        this.setMaxActions(sensor.max_action);
                    }
                });
            }
        }
        var ws_user_values = WS4Redis({
            uri: window.ws_uri + 'user_values?subscribe-broadcast&publish-broadcast',
            receive_message: receiveMessage,
            heartbeat_msg: window.ws_heartbeat
        });
        var ws_current_values = WS4Redis({
            uri: window.ws_uri + 'current_values?subscribe-broadcast&publish-broadcast',
            receive_message: receiveMessage,
            heartbeat_msg: window.ws_heartbeat
        });
        var ws_status = WS4Redis({
            uri: window.ws_uri + 'status?subscribe-broadcast&publish-broadcast',
            receive_message: receiveMessage,
            heartbeat_msg: window.ws_heartbeat
        });

        function Sensor(id) {
            this.id = id;
            var $sensor = $("#sensor_"+id);
            this.$switch = $sensor.find(".js-switch");
            this.$caption = $sensor.find(".sensor-list-header-caption");
            this.$data = $sensor.find(".sensor-list-header-data");
            this.$minVal = $sensor.find(".slider-min");
            this.$minVal.bootstrapSlider();
            this.$maxVal = $sensor.find(".slider-max");
            this.$maxVal.bootstrapSlider();
            this.$minHeaterOn = $sensor.find(".actions-min .action-heater-on");
            this.$minHeaterOff = $sensor.find(".actions-min .action-heater-off");
            this.$minTelegram = $sensor.find(".actions-min .action-telegram");
            this.$maxHeaterOn = $sensor.find(".actions-max .action-heater-on");
            this.$maxHeaterOff = $sensor.find(".actions-max .action-heater-off");
            this.$maxTelegram = $sensor.find(".actions-max .action-telegram");
        }
        Sensor.prototype.setCaption = function(data) {
            this.$caption.text(data);
        };
        Sensor.prototype.setData = function(data) {
            this.$data.text(data);
        };
        Sensor.prototype.setMin = function(data) {
            this.$minVal.bootstrapSlider('setValue', data);
        };
        Sensor.prototype.getMin = function() {
            return this.$minVal.bootstrapSlider('getValue');
        };
        Sensor.prototype.setMax = function(data) {
            this.$maxVal.bootstrapSlider('setValue', data);
        };
        Sensor.prototype.getMax = function() {
            return this.$maxVal.bootstrapSlider('getValue');
        };
        Sensor.prototype.isChecked = function() {
            return this.$switch.first().prop("checked");
        };
        Sensor.prototype.setSwitch = function(state) {
            return this.$switch.first().prop("checked", state);
        };
        Sensor.prototype.getMinActions = function() {
            var actions = [];
            this.$minHeaterOn.first().prop("checked") ? actions.push('heater_on') : null;
            this.$minHeaterOff.first().prop("checked") ? actions.push('heater_off') : null;
            this.$minTelegram.first().prop("checked") ? actions.push('telegram') : null;
            return actions;
        };
        Sensor.prototype.getMaxActions = function() {
            var actions = [];
            this.$maxHeaterOn.first().prop("checked") ? actions.push('heater_on') : null;
            this.$maxHeaterOff.first().prop("checked") ? actions.push('heater_off') : null;
            this.$maxTelegram.first().prop("checked") ? actions.push('telegram') : null;
            return actions;
        };
        Sensor.prototype.setMinActions = function(actions) {
            $.inArray('heater_on', actions) !== -1 ? this.$minHeaterOn.iCheck("check") : this.$minHeaterOn.iCheck("uncheck");
            $.inArray('heater_off', actions) !== -1 ? this.$minHeaterOff.iCheck("check") : this.$minHeaterOff.iCheck("uncheck");
            $.inArray('telegram', actions) !== -1 ? this.$minTelegram.iCheck("check") : this.$minTelegram.iCheck("uncheck");
        };
        Sensor.prototype.setMaxActions = function(actions) {
            $.inArray('heater_on', actions) !== -1 ? this.$maxHeaterOn.iCheck("check") : this.$maxHeaterOn.iCheck("uncheck");
            $.inArray('heater_off', actions) !== -1 ? this.$maxHeaterOff.iCheck("check") : this.$maxHeaterOff.iCheck("uncheck");
            $.inArray('telegram', actions) !== -1 ? this.$maxTelegram.iCheck("check") : this.$maxTelegram.iCheck("uncheck");
        };
        Sensor.prototype.getState = function() {
            var state = {};
            state[this.id] = {
                "max_value": this.getMax(),
                "min_value": this.getMin(),
                "max_action": this.getMaxActions(),
                "min_action": this.getMinActions()
            };
            return state;
        };

        function getSensorsJson(sensorArray) {
            var sensors = {};
            $.each(sensorArray, function() {
                $.extend(sensors, this.getState(), true);
            });

            var result = {
                "type": "user_values",
                "sensors": sensors
            };
            return JSON.stringify(result);
        }

        function sensorLoadState() {
            // state = {"1": "true", "3": "false"}
            return JSON.parse( localStorage.getItem('sensors_state') );
        }

        function sensorSaveState(sensorArray) {
            var sensors = {};
            $.each(sensorArray, function() {
                var state = {};
                state[this.id] = this.isChecked();
                //sensors.push( state );
                $.extend(true, sensors, state);
            });
            localStorage.setItem( 'sensors_state', JSON.stringify(sensors) );
        }

        $('#sensor-list .js-switch').on('change', function(){
            // gather all checkbox-states and generate new global "sensors" variable
            // save checkboxes to localstorage
            // recreate Highcharts container
            var sensorArray = getSensorList();
            sensorSaveState(sensorArray);
            sensors = [];
            $.each(sensorArray, function() {
                if (this.isChecked()) {
                    sensors.push({"id": this.id, "name": this.$caption.text()});
                }
            });
            var chart = $('#container').highcharts();
            if (chart) {
                chart.destroy();
            }
            update_chart();
        });

        $('.accordion-inner input').on('change ifChanged', function() {
            ws_user_values.send_message( getSensorsJson( sensor_list ) );
        });

        function getSensorList() {
            var sensors = $("#sensor-list .sensor");
            var result = [];
            $.each(sensors, function() {
                var id = $(this).attr("data-id");
                result.push( new Sensor(id) );
            });
            return result;
        }

        function setSwitchery(switchElement, checkedBool) {
            if((checkedBool && !switchElement.isChecked()) || (!checkedBool && switchElement.isChecked())) {
                switchElement.setPosition(true);
                //switchElement.handleOnchange(true);
            }
        }

        var seriesOptions = [],
            seriesCounter = 0,
            sensors = [];
            //sensors = [{"id": "1", "name": "окно"}, {"id": "2", "name": "комната"}];

        var sensor_list = getSensorList();
        var sensor_state = sensorLoadState();
        $.each(sensor_list, function() {
            var switchery = new Switchery(this.$switch[0]);
            if (sensor_state && sensor_state[this.id]) {
                sensors.push({"id": this.id, "name": this.$caption.text()});
                setSwitchery(switchery, true);
            } else {
                setSwitchery(switchery, false);
            }
        });

        Highcharts.setOptions({
                lang: {
                loading: 'Загрузка...',
                months: ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'],
                weekdays: ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'],
                shortMonths: ['Янв', 'Фев', 'Март', 'Апр', 'Май', 'Июнь', 'Июль', 'Авг', 'Сент', 'Окт', 'Нояб', 'Дек'],
                exportButtonTitle: "Экспорт",
                printButtonTitle: "Печать",
                rangeSelectorFrom: "С",
                rangeSelectorTo: "По",
                rangeSelectorZoom: "Период",
                downloadPNG: 'Скачать PNG',
                downloadJPEG: 'Скачать JPEG',
                downloadPDF: 'Скачать PDF',
                downloadSVG: 'Скачать SVG',
                printChart: 'Напечатать график'
                },
                global: {
                    useUTC: false
                }
        });

        function get_scale_by_range(range) {
            var range_scale = [
                {'range': 2678400000 * 12, 'scale': 44640}, // > year
                {'range': 2678400000 * 3, 'scale': 1440}, // > 3*month
                {'range': 2678400000, 'scale': 60}, // > month
                {'range': 604800000, 'scale': 60}, // > week
                {'range': 86400000, 'scale': 5}, // > day
                {'range': 3600000, 'scale': 1}, // > hour
                {'range': 0, 'scale': 1} // > all other zoom
            ];
            for (var i = 0; i < range_scale.length; i++) {
                if (range > range_scale[i].range) return range_scale[i].scale;
            }
        }

        function createChart() {

            $('#container').highcharts('StockChart', {

                chart: {
                    type: 'spline',
                    zoomType: 'x',
                    alignTicks: false
                },

                navigator: {
                    adaptToUpdatedData: false
                },

                scrollbar: {
                    liveRedraw: false
                },

                title: {
                    text: 'датчики-дачники'
                },

                subtitle: {
                    text: 'температурка'
                },

                credits: {
                    enabled: false
                },

                rangeSelector: {
                    buttons: [
                        {
                            type: 'hour',
                            count: 1,
                            text: 'час'
                        },
                        {
                            type: 'day',
                            count: 1,
                            text: 'день'
                        },
                        {
                            type: 'month',
                            count: 1,
                            text: 'месяц'
                        },
                        {
                            type: 'year',
                            count: 1,
                            text: 'год'
                        },
                        {
                            type: 'all',
                            text: 'ойвсё'
                        }
                    ],
                    buttonTheme: {
                        width: null,
                        padding: 2
                    },
                    inputEnabled: false, // it supports only days
                    selected: 4 // all
                },

                exporting: {
                    buttons: {
                        customButton: {
                            x: -32,
                            text: 'пульнуть в конец',
                            onclick: function () {

                                var chart = $('#container').highcharts();
                                chart.showLoading('подсос данных...');
                                // turn off afterSetExtremes
                                afterSetExtremes = function(e) {};
                                var xAxis_max = chart.xAxis[0].getExtremes().max;
                                $.each(sensors, function (i, sensor) {

                                    $.getJSON('/data/' + sensor.id + '/' +
                                                  0 + '/' +
                                                  9452492000000 + '/' +
                                                  44640 + '/', function (data) {
                                        data = data.data;
                                        if (data && data[data.length-1]) {
                                            max_ts = data[data.length - 1][0];
                                            if (max_ts > xAxis_max) {
                                                xAxis_max = max_ts;
                                            }
                                        }

                                        // As we're loading the data asynchronously, we don't know what order it will arrive. So
                                        // we keep a counter and create the chart when all the data is loaded.
                                        seriesCounter += 1;
                                        if (seriesCounter === Object.keys(sensors).length) {
                                            seriesCounter = 0;
                                            chart.hideLoading();
                                            // restore original afterSetExtremes handler
                                            afterSetExtremes = eval('('+orig_afterSetExtremes+')');
                                            chart.xAxis[1].max = xAxis_max;

                                            var e = chart.xAxis[0].getExtremes();
                                            var diff = (e.max - e.min);
                                            chart.xAxis[0].setExtremes(chart.xAxis[1].max - diff, chart.xAxis[1].max);
                                        }
                                    });
                                });
                            }
                        }
                    }
                },

                xAxis: {
                    events: {
                        afterSetExtremes: function(e) { afterSetExtremes(e); }
                    },
                    minRange: 300*1000 //3600 * 1000 // one hour
                },

                series: seriesOptions
            });
        }

        function update_chart() {
            $.each(sensors, function (i, sensor) {
                $.getJSON('/data/' + sensor.id + '/0/9452492000000/5/', function (data) {
                    data = data.data;

                    seriesOptions[i] = {
                        name: sensor.name,
                        data: data,
                        dataGrouping: {
                            enabled: false
                        }
                    };

                    // As we're loading the data asynchronously, we don't know what order it will arrive. So
                    // we keep a counter and create the chart when all the data is loaded.
                    seriesCounter += 1;

                    if (seriesCounter === Object.keys(sensors).length) {
                        createChart();
                        seriesCounter = 0;
                    }
                });
            });
        }

        function afterSetExtremes(e) {
            var chart = $('#container').highcharts();
            chart.showLoading('подсос данных...');
            $.each(sensors, function (i, sensor) {
                $.getJSON('/data/' + sensor.id + '/' +
                              Math.round(e.min) + '/' +
                              Math.round(e.max) + '/' +
                              get_scale_by_range(e.max - e.min) + '/', function (data) {
                    data = data.data;

                    seriesOptions[i] = {
                        name: sensor.name,
                        data: data,
                        dataGrouping: {
                            enabled: false
                        }
                    };
                    chart.series[i].setData(data);

                    // As we're loading the data asynchronously, we don't know what order it will arrive. So
                    // we keep a counter and create the chart when all the data is loaded.
                    seriesCounter += 1;
                    if (seriesCounter === Object.keys(sensors).length) {
                        seriesCounter = 0;
                        chart.hideLoading();
                    }
                });
            });
        }
        var orig_afterSetExtremes = afterSetExtremes.toString();

        update_chart();

    });
})(jQuery);