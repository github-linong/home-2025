; (function () {
  Vue.component('overall-charts', {
    props: ['labels', 'series', 'perEndpoint', 'granularity'],
    template: `
      <div>
        <el-row :gutter="8">
          <el-col :span="12">
            <div class="panel">
              <h3 class="panel-title">Overall Trend (Total / Success / Failure)</h3>
              <div ref="trend" class="chart"></div>
            </div>
          </el-col>
          <el-col :span="12">
            <div class="panel">
              <h3 class="panel-title">Histogram by {{ granularity === 'hour' ? 'Hour' : 'Day' }}</h3>
              <div ref="hist" class="chart"></div>
            </div>
          </el-col>
        </el-row>
        <el-row :gutter="8" style="margin-top:8px;">
          <el-col :span="8">
            <div class="panel"><h3 class="panel-title">Total by Endpoint</h3><div ref="pieTotal" class="chart-sm"></div></div>
          </el-col>
          <el-col :span="8">
            <div class="panel"><h3 class="panel-title">Success by Endpoint</h3><div ref="pieSuccess" class="chart-sm"></div></div>
          </el-col>
          <el-col :span="8">
            <div class="panel"><h3 class="panel-title">Failure by Endpoint</h3><div ref="pieFailure" class="chart-sm"></div></div>
          </el-col>
        </el-row>
      </div>
    `,
    mounted: function () { this.init(); this.render(); window.addEventListener('resize', this.onResize); },
    beforeDestroy: function () { window.removeEventListener('resize', this.onResize); },
    watch: { labels: 'render', series: { deep: true, handler: 'render' }, perEndpoint: { deep: true, handler: 'render' }, granularity: 'render' },
    methods: {
      init: function () {
        this.chartTrend = echarts.init(this.$refs.trend);
        this.chartHist = echarts.init(this.$refs.hist);
        this.chartPieTotal = echarts.init(this.$refs.pieTotal);
        this.chartPieSuccess = echarts.init(this.$refs.pieSuccess);
        this.chartPieFailure = echarts.init(this.$refs.pieFailure);
      },
      render: function () {
        if (!this.labels || !this.series) return;
        var labels = this.labels;
        var axisStyle = { color: '#9aa4c7' };
        // success rate for combo
        var succRate = [];
        for (var i = 0; i < (this.series.total || []).length; i++) {
          var t = this.series.total[i] || 0; var ok = this.series.success[i] || 0;
          succRate.push(t > 0 ? +(ok * 100 / t).toFixed(2) : null);
        }
        // Fancy trend with gradient areas and dataZoom, adjust boundaries
        this.chartTrend.setOption({
          backgroundColor: 'transparent',
          tooltip: { trigger: 'axis' },
          legend: { data: ['Total', 'Success', 'Failure'], textStyle: { color: '#c7d2fe' } },
          grid: { left: 36, right: 16, top: 16, bottom: 56, containLabel: true },
          dataZoom: [{ type: 'inside' }, { type: 'slider', height: 12, bottom: 24 }],
          xAxis: { type: 'category', boundaryGap: false, data: labels, axisLabel: { color: '#9aa4c7', margin: 10 }, axisLine: { lineStyle: { color: '#334155' } } },
          yAxis: [
            { type: 'value', scale: true, axisLabel: { color: '#9aa4c7', margin: 8 }, splitLine: { lineStyle: { color: '#1f2a44' } } },
            { type: 'value', min: 0, max: 100, axisLabel: { color: '#FDE68A', formatter: '{value}%' }, splitLine: { show: false } }
          ],
          series: [
            {
              name: 'Total', type: 'line', smooth: true, showSymbol: false, data: this.series.total,
              lineStyle: { width: 1.5, color: '#60A5FA' }, clip: true,
              areaStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: 'rgba(96,165,250,0.35)' }, { offset: 1, color: 'rgba(96,165,250,0.02)' }]) }
            },
            {
              name: 'Success', type: 'line', smooth: true, showSymbol: false, data: this.series.success,
              lineStyle: { width: 1.5, color: '#34D399' }, clip: true,
              areaStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: 'rgba(52,211,153,0.28)' }, { offset: 1, color: 'rgba(52,211,153,0.02)' }]) }
            },
            { name: 'Failure', type: 'bar', data: this.series.failure, barWidth: 5, clip: true, itemStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: '#F59E0B' }, { offset: 1, color: '#B45309' }]) } },
            { name: 'Success Rate', type: 'line', yAxisIndex: 1, smooth: true, showSymbol: false, data: succRate, lineStyle: { width: 2, color: '#FDE68A' } }
          ],
          animationDuration: 600,
          animationEasing: 'cubicOut'
        });
        // Prepare moving average for combo effect on histogram
        function movingAvg(arr, win) {
          var out = [], sum = 0; win = Math.max(3, Math.min(win, arr.length));
          for (var i = 0; i < arr.length; i++) {
            sum += arr[i];
            if (i >= win) sum -= arr[i - win];
            out.push(i >= win - 1 ? Math.round(sum / win) : null);
          }
          return out;
        }
        var avgTotal = movingAvg(this.series.total, Math.round(labels.length / 24) || 12);
        // Fancy histogram with gradient bars + overlay line (combo), adjust boundaries
        this.chartHist.setOption({
          backgroundColor: 'transparent',
          tooltip: { trigger: 'axis' },
          grid: { left: 36, right: 16, top: 16, bottom: 56, containLabel: true },
          dataZoom: [{ type: 'inside' }, { type: 'slider', height: 12, bottom: 24 }],
          xAxis: { type: 'category', data: labels, axisLabel: { color: '#9aa4c7', interval: 'auto', margin: 10 }, axisLine: { lineStyle: { color: '#334155' } } },
          yAxis: { type: 'value', scale: true, axisLabel: { color: '#9aa4c7', margin: 8 }, splitLine: { lineStyle: { color: '#1f2a44' } } },
          series: [
            {
              name: 'Total', type: 'bar', data: this.series.total, barWidth: 5, clip: true,
              itemStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: '#8B5CF6' }, { offset: 1, color: '#4C1D95' }]) }
            },
            {
              name: 'MA (Total)', type: 'line', data: avgTotal, smooth: true, showSymbol: false, clip: true,
              lineStyle: { width: 2, color: '#FDE68A' }, areaStyle: { color: 'rgba(253,230,138,0.06)' }
            }
          ],
          animationDuration: 600,
          animationEasing: 'cubicOut'
        });
        function pie(data) {
          return {
            backgroundColor: 'transparent',
            tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
            series: [{
              type: 'pie', roseType: 'radius', radius: ['30%', '70%'],
              itemStyle: { borderRadius: 6, borderColor: '#0f172a', borderWidth: 2, shadowBlur: 8, shadowColor: 'rgba(0,0,0,0.3)' },
              label: { color: '#c7d2fe' },
              labelLine: { length: 10, length2: 6, smooth: true },
              data: data
            }]
          };
        }
        var ep = Object.keys(this.perEndpoint.total || {});
        var toArr = ep.map(function (e) { return { name: e, value: (this.perEndpoint.total || {})[e] || 0 }; }, this);
        var okArr = ep.map(function (e) { return { name: e, value: (this.perEndpoint.success || {})[e] || 0 }; }, this);
        var erArr = ep.map(function (e) { return { name: e, value: (this.perEndpoint.failure || {})[e] || 0 }; }, this);
        this.chartPieTotal.setOption(pie(toArr));
        this.chartPieSuccess.setOption(pie(okArr));
        this.chartPieFailure.setOption(pie(erArr));
      },
      onResize: function () { this.chartTrend && this.chartTrend.resize(); this.chartHist && this.chartHist.resize(); this.chartPieTotal && this.chartPieTotal.resize(); this.chartPieSuccess && this.chartPieSuccess.resize(); this.chartPieFailure && this.chartPieFailure.resize(); }
    }
  });
})();


