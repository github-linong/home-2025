; (function () {
    Vue.component('device-tabs', {
        props: ['devices', 'labels', 'endpoints', 'granularity'],
        template: `
      <div class="panel">
        <h3 class="panel-title">Device Stats</h3>
        <el-tabs v-if="devices && devices.length" v-model="active" type="border-card" @tab-click="renderActive">
          <el-tab-pane v-for="dev in devices" :key="dev" :name="dev" :label="dev">
            <div style="display:grid; grid-template-columns: 2fr 2fr 1fr 1fr 1fr; gap:8px; align-items: stretch;">
              <div><h4 class="panel-title">Trend</h4><div :id="idOf(dev,'trend')" class="chart-sm"></div></div>
              <div><h4 class="panel-title">Histogram</h4><div :id="idOf(dev,'hist')" class="chart-sm"></div></div>
              <div><h4 class="panel-title">Total by Endpoint</h4><div :id="idOf(dev,'pie-total')" class="chart-sm"></div></div>
              <div><h4 class="panel-title">Success by Endpoint</h4><div :id="idOf(dev,'pie-success')" class="chart-sm"></div></div>
              <div><h4 class="panel-title">Failure by Endpoint</h4><div :id="idOf(dev,'pie-failure')" class="chart-sm"></div></div>
            </div>
          </el-tab-pane>
        </el-tabs>
        <div v-else class="subtle" style="padding:8px 0;">No devices selected. Use "添加设备" to add one.</div>
      </div>
    `,
        data: function () { return { active: this.devices[0] || '', charts: {} }; },
        methods: {
            idOf: function (dev, part) { return 'dev-' + part + '-' + dev; },
            ensureRefs: function (dev) {
                if (!this.charts[dev]) this.charts[dev] = {}; var r = this.charts[dev];
                function inst(id, key) { var el = document.getElementById(id); if (el && !r[key]) r[key] = echarts.init(el); }
                inst(this.idOf(dev, 'trend'), 'trend'); inst(this.idOf(dev, 'hist'), 'hist'); inst(this.idOf(dev, 'pie-total'), 'pieTotal'); inst(this.idOf(dev, 'pie-success'), 'pieSuccess'); inst(this.idOf(dev, 'pie-failure'), 'pieFailure');
            },
            computeSeries: function (dev) {
                var buckets = this.labels; var total = [], ok = [], err = []; var perTotal = {}, perOk = {}, perEr = {};
                for (var i = 0; i < this.endpoints.length; i++) { perTotal[this.endpoints[i]] = 0; perOk[this.endpoints[i]] = 0; perEr[this.endpoints[i]] = 0; }
                for (var bi = 0; bi < buckets.length; bi++) {
                    var label = buckets[bi]; var seed = StatsUtils.hashCode(label + '|' + dev);
                    var base = StatsUtils.seededRandomInt(seed, 40, 120); var r = StatsUtils.mulberry32(seed)();
                    var okc = Math.floor(base * (0.93 + r * 0.04)); var erc = Math.max(0, base - okc);
                    total.push(base); ok.push(okc); err.push(erc);
                    for (var ei = 0; ei < this.endpoints.length; ei++) {
                        var ep = this.endpoints[ei]; var epSeed = StatsUtils.hashCode(label + '|' + dev + '|' + ep);
                        var epTot = Math.max(0, Math.floor(base * (0.05 + StatsUtils.mulberry32(epSeed)() * 0.25)));
                        var epOk = Math.max(0, Math.floor(epTot * (0.95 + StatsUtils.mulberry32(epSeed + 7)() * 0.03)));
                        var epEr = Math.max(0, epTot - epOk);
                        perTotal[ep] += epTot; perOk[ep] += epOk; perEr[ep] += epEr;
                    }
                }
                return { total: total, ok: ok, err: err, perTotal: perTotal, perOk: perOk, perEr: perEr };
            },
            renderFor: function (dev) {
                this.ensureRefs(dev);
                var s = this.computeSeries(dev); var labels = this.labels; var r = this.charts[dev]; var axisStyle = { color: '#9aa4c7' };
                r.trend.setOption({ backgroundColor: 'transparent', tooltip: { trigger: 'axis' }, legend: { data: ['Total', 'Success', 'Failure'], textStyle: { color: '#c7d2fe' } }, grid: { left: 40, right: 20, top: 20, bottom: 30 }, xAxis: { type: 'category', data: labels, axisLabel: axisStyle, axisLine: { lineStyle: { color: '#334155' } } }, yAxis: { type: 'value', axisLabel: axisStyle, splitLine: { lineStyle: { color: '#1f2a44' } } }, series: [{ name: 'Total', type: 'line', smooth: true, showSymbol: false, data: s.total }, { name: 'Success', type: 'line', smooth: true, showSymbol: false, data: s.ok }, { name: 'Failure', type: 'bar', data: s.err, barWidth: 8 }] });
                r.hist.setOption({ backgroundColor: 'transparent', tooltip: { trigger: 'axis' }, grid: { left: 40, right: 20, top: 20, bottom: 30 }, xAxis: { type: 'category', data: labels, axisLabel: axisStyle, axisLine: { lineStyle: { color: '#334155' } } }, yAxis: { type: 'value', axisLabel: axisStyle, splitLine: { lineStyle: { color: '#1f2a44' } } }, series: [{ type: 'bar', data: s.total }] });
                function pie(data) { return { backgroundColor: 'transparent', tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' }, series: [{ type: 'pie', radius: ['40%', '70%'], itemStyle: { borderRadius: 6, borderColor: '#0f172a', borderWidth: 2 }, label: { color: '#c7d2fe' }, data: data }] }; }
                var toArr = this.endpoints.map(function (e) { return { name: e, value: s.perTotal[e] || 0 }; });
                var okArr = this.endpoints.map(function (e) { return { name: e, value: s.perOk[e] || 0 }; });
                var erArr = this.endpoints.map(function (e) { return { name: e, value: s.perEr[e] || 0 }; });
                r.pieTotal.setOption(pie(toArr)); r.pieSuccess && r.pieSuccess.setOption(pie(okArr)); r.pieFailure.setOption(pie(erArr));
            },
            renderActive: function () { if (this.active) { var self = this; this.$nextTick(function () { self.renderFor(self.active); }); } },
            onResize: function () { var self = this; Object.keys(this.charts).forEach(function (dev) { var r = self.charts[dev]; if (r.trend) r.trend.resize(); if (r.hist) r.hist.resize(); if (r.pieTotal) r.pieTotal.resize(); if (r.pieSuccess) r.pieSuccess.resize(); if (r.pieFailure) r.pieFailure.resize(); }); }
        },
        mounted: function () { this.active = this.devices[0] || ''; this.renderActive(); window.addEventListener('resize', this.onResize); },
        beforeDestroy: function () { window.removeEventListener('resize', this.onResize); },
        watch: { devices: function () { if (!this.active && this.devices.length) this.active = this.devices[0]; this.renderActive(); }, labels: 'renderActive', granularity: 'renderActive' }
    });
})();


