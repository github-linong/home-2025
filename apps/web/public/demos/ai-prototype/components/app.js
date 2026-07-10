; (function () {
    Vue.component('stats-app', {
        template: `
      <el-container style="height:100%">
        <el-header height="60px" style="background:#0f172a; border-bottom:1px solid #1e2a44; display:flex; align-items:center; padding:0 16px;">
          <stats-toolbar :range-picker.sync="rangePicker" :granularity.sync="granularity" :all-devices="allDevices" :selected-devices.sync="selectedDevices" :auto.sync="auto" @range-change="handleRangeChange" @gran-change="handleRangeChange" @devices-change="handleDevicesChange" @toggle-auto="toggleAuto" @refresh="refreshAll"></stats-toolbar>
        </el-header>
        <el-main style="padding:12px;">
          <div class="panel">
            <el-row :gutter="8" style="align-items: stretch;">
              <el-col :span="14">
                <div>
                  <kpi-cards :kpis="kpis"></kpi-cards>
                  <div style="height:8px"></div>
                  <topn-devices :topN="topN" :hide-title="true" @pick-device="quickPick"></topn-devices>
                </div>
              </el-col>
              <el-col :span="10">
                <network-graph :devices="selectedDevices.length?selectedDevices:allDevices" :endpoints="endpoints" :height="190"></network-graph>
              </el-col>
            </el-row>
          </div>
          <div style="height:8px"></div>
          <overall-charts :labels="labelsComputed" :series="{ total: overall.total, success: overall.success, failure: overall.failure }" :per-endpoint="overall.perEndpoint" :granularity="granularity"></overall-charts>
          <div style="height:8px"></div>
          <div style="height:8px"></div>
          <device-tabs :devices="selectedDevices" :labels="labelsComputed" :endpoints="endpoints" :granularity="granularity"></device-tabs>
        </el-main>
      </el-container>
    `,
        data: function () {
            var now = new Date();
            var start = new Date(); start.setDate(start.getDate() - 30);
            return {
                rangePicker: [start, now],
                granularity: 'hour',
                endpoints: ['/quantum/handshake', '/quantum/key-exchange', '/quantum/verify', '/quantum/ping', '/quantum/decode', '/quantum/sign', '/quantum/recover'],
                allDevices: ['device-001', 'device-002', 'device-003', 'device-004', 'device-005', 'device-006', 'device-007', 'device-008', 'device-009', 'device-010', 'device-011', 'device-012'],
                selectedDevices: [],
                auto: true,
                buckets: [],
                labelsComputed: [],
                overall: { total: [], success: [], failure: [], perEndpoint: { total: {}, success: {}, failure: {} } },
                kpis: { total: 0, success: 0, failure: 0 },
                topN: { requests: [], success: [], failure: [] }
            };
        },
        methods: {
            formatNumber: function (n) { if (n == null) return '0'; return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ','); },
            buildBuckets: function () {
                var s = StatsUtils.startOf(this.rangePicker[0], this.granularity);
                var e = this.rangePicker[1];
                var arr = [];
                while (s <= e) { arr.push(new Date(s)); s = StatsUtils.addGran(s, this.granularity, 1); }
                this.buckets = arr;
                this.labelsComputed = arr.map(this.bucketLabel);
            },
            computeOverall: function () {
                var perEndpointTotal = {}, perEndpointOk = {}, perEndpointEr = {};
                for (var i = 0; i < this.endpoints.length; i++) { perEndpointTotal[this.endpoints[i]] = 0; perEndpointOk[this.endpoints[i]] = 0; perEndpointEr[this.endpoints[i]] = 0; }
                var total = [], ok = [], err = [];
                for (var bi = 0; bi < this.buckets.length; bi++) {
                    var label = this.bucketLabel(this.buckets[bi]);
                    var baseSeed = StatsUtils.hashCode(label + '|overall');
                    var base = StatsUtils.seededRandomInt(baseSeed, 200, 400);
                    var okc = Math.floor(base * (0.94 + (StatsUtils.mulberry32(baseSeed)()) * 0.03));
                    var erc = Math.max(0, base - okc);
                    total.push(base); ok.push(okc); err.push(erc);
                    for (var ei = 0; ei < this.endpoints.length; ei++) {
                        var ep = this.endpoints[ei];
                        var epSeed = StatsUtils.hashCode(label + '|' + ep);
                        var epTot = Math.max(0, Math.floor(base * (0.05 + (StatsUtils.mulberry32(epSeed)()) * 0.2)));
                        var epOk = Math.floor(epTot * (0.95 + (StatsUtils.mulberry32(epSeed + 7)()) * 0.03));
                        var epEr = Math.max(0, epTot - epOk);
                        perEndpointTotal[ep] += epTot; perEndpointOk[ep] += epOk; perEndpointEr[ep] += epEr;
                    }
                }
                this.overall.total = total; this.overall.success = ok; this.overall.failure = err;
                this.overall.perEndpoint.total = perEndpointTotal; this.overall.perEndpoint.success = perEndpointOk; this.overall.perEndpoint.failure = perEndpointEr;
                this.kpis.total = total.reduce(function (a, b) { return a + b; }, 0);
                this.kpis.success = ok.reduce(function (a, b) { return a + b; }, 0);
                this.kpis.failure = err.reduce(function (a, b) { return a + b; }, 0);
            },
            computeTopN: function () {
                var self = this;
                function deviceAgg(dev) {
                    var t = 0, o = 0, e = 0;
                    for (var bi = 0; bi < self.buckets.length; bi++) {
                        var label = self.bucketLabel(self.buckets[bi]);
                        var seed = StatsUtils.hashCode(label + '|' + dev);
                        var base = StatsUtils.seededRandomInt(seed, 40, 120);
                        var okc = Math.floor(base * (0.93 + (StatsUtils.mulberry32(seed)()) * 0.04));
                        var erc = Math.max(0, base - okc);
                        t += base; o += okc; e += erc;
                    }
                    return { device: dev, total: t, success: o, failure: e };
                }
                var agg = this.allDevices.map(deviceAgg);
                this.topN.requests = agg.slice().sort(function (a, b) { return b.total - a.total; }).slice(0, 3).map(function (x) { return { device: x.device, value: x.total }; });
                this.topN.success = agg.slice().sort(function (a, b) { return b.success - a.success; }).slice(0, 3).map(function (x) { return { device: x.device, value: x.success }; });
                this.topN.failure = agg.slice().sort(function (a, b) { return b.failure - a.failure; }).slice(0, 3).map(function (x) { return { device: x.device, value: x.failure }; });
            },
            bucketLabel: function (d) {
                var y = d.getFullYear(); var m = (d.getMonth() + 1 + '').padStart(2, '0'); var day = (d.getDate() + '').padStart(2, '0');
                if (this.granularity === 'day') return y + '-' + m + '-' + day;
                var h = (d.getHours() + '').padStart(2, '0');
                return y + '-' + m + '-' + day + ' ' + h + ':00';
            },
            refreshAll: function () { this.buildBuckets(); this.computeOverall(); this.computeTopN(); },
            toggleAuto: function (flag) {
                this.auto = flag;
                if (this.auto) {
                    if (this._timer) clearInterval(this._timer);
                    var self = this;
                    this._timer = setInterval(function () {
                        self.tick();
                    }, 2000);
                } else {
                    if (this._timer) { clearInterval(this._timer); this._timer = null; }
                }
            },
            quickPick: function (dev) {
                if (!dev) return;
                if (this.selectedDevices.indexOf(dev) === -1) this.selectedDevices = [dev];
                this.$nextTick(this.refreshAll);
            },
            tick: function () {
                // 追加最新一个时间桶并移除最早一个
                var last = this.buckets[this.buckets.length - 1] || new Date();
                var next = StatsUtils.addGran(last, this.granularity, 1);
                this.buckets.push(next);
                if (this.buckets.length > 200) this.buckets.shift();
                this.labelsComputed = this.buckets.map(this.bucketLabel);

                // 基于上一刻的随机增量更新 overall & topN
                var label = this.bucketLabel(next);
                var baseSeed = StatsUtils.hashCode(label + '|overall');
                var base = StatsUtils.seededRandomInt(baseSeed, 200, 400);
                var okc = Math.floor(base * (0.94 + (StatsUtils.mulberry32(baseSeed)()) * 0.03));
                var erc = Math.max(0, base - okc);
                this.overall.total.push(base);
                this.overall.success.push(okc);
                this.overall.failure.push(erc);
                if (this.overall.total.length > this.labelsComputed.length) {
                    this.overall.total.shift();
                    this.overall.success.shift();
                    this.overall.failure.shift();
                }
                // perEndpoint 累积
                for (var i = 0; i < this.endpoints.length; i++) {
                    var ep = this.endpoints[i];
                    var epSeed = StatsUtils.hashCode(label + '|' + ep);
                    var epTot = Math.max(0, Math.floor(base * (0.05 + (StatsUtils.mulberry32(epSeed)()) * 0.2)));
                    var epOk = Math.floor(epTot * (0.95 + (StatsUtils.mulberry32(epSeed + 7)()) * 0.03));
                    var epEr = Math.max(0, epTot - epOk);
                    this.overall.perEndpoint.total[ep] = (this.overall.perEndpoint.total[ep] || 0) + epTot;
                    this.overall.perEndpoint.success[ep] = (this.overall.perEndpoint.success[ep] || 0) + epOk;
                    this.overall.perEndpoint.failure[ep] = (this.overall.perEndpoint.failure[ep] || 0) + epEr;
                }
                // KPI 重新计算
                var sum = function (arr) { return arr.reduce(function (a, b) { return a + b; }, 0); };
                this.kpis.total = sum(this.overall.total);
                this.kpis.success = sum(this.overall.success);
                this.kpis.failure = sum(this.overall.failure);

                // TopN 重算（轻量方式）
                this.computeTopN();
            },
            handleRangeChange: function () { this.refreshAll(); },
            handleDevicesChange: function () { this.$nextTick(this.refreshAll); },
            selfTest: function () { var ok = this.kpis.total >= this.kpis.success + this.kpis.failure - 1; console.log('[stats self-test] totals >= success+failure?', ok); }
        },
        mounted: function () { this.refreshAll(); setTimeout(this.selfTest, 300); this.toggleAuto(true); },
    });
})();


