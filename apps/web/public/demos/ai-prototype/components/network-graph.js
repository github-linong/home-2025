; (function () {
    Vue.component('network-graph', {
        props: ['devices', 'endpoints', 'height'],
        template: `
      <div class="panel" :style="{height: (height?height:200) + 'px'}">
        <h3 class="panel-title">Quantum Nodes · Topology</h3>
        <div ref="net" style="width:100%; height:calc(100% - 24px);"></div>
      </div>
    `,
        data: function () { return { chart: null, timer: null }; },
        methods: {
            genData: function () {
                var nodes = [], links = [], cats = [];
                cats.push({ name: 'Device' });
                cats.push({ name: 'Endpoint' });
                for (var i = 0; i < (this.devices || []).length; i++) {
                    nodes.push({ id: 'dev-' + i, name: this.devices[i], category: 0, symbolSize: 10 + Math.random() * 6 });
                }
                for (var j = 0; j < (this.endpoints || []).length; j++) {
                    nodes.push({ id: 'ep-' + j, name: this.endpoints[j], category: 1, symbolSize: 12 + Math.random() * 8 });
                }
                // Sparse random edges: device -> endpoint
                for (var di = 0; di < (this.devices || []).length; di++) {
                    var count = 2 + Math.floor(Math.random() * 3);
                    for (var k = 0; k < count; k++) {
                        var ej = Math.floor(Math.random() * (this.endpoints || []).length);
                        links.push({ source: 'dev-' + di, target: 'ep-' + ej, value: 1 + Math.floor(Math.random() * 5) });
                    }
                }
                return { nodes: nodes, links: links, categories: cats };
            },
            render: function () {
                if (!this.chart) this.chart = echarts.init(this.$refs.net);
                var d = this.genData();
                this.chart.setOption({
                    backgroundColor: 'transparent',
                    tooltip: { formatter: function (p) { return p.data.name || (p.data.source + ' → ' + p.data.target); } },
                    legend: [{ data: d.categories.map(function (x) { return x.name; }), textStyle: { color: '#c7d2fe' }, top: 0 }],
                    series: [{
                        type: 'graph',
                        layout: 'force',
                        roam: true,
                        animationDuration: 800,
                        animationEasing: 'cubicOut',
                        label: { show: true, color: '#9aa4c7', fontSize: 10 },
                        categories: d.categories,
                        data: d.nodes,
                        force: { repulsion: 120, edgeLength: [30, 90] },
                        edges: d.links,
                        lineStyle: { color: 'source', width: 1.2, curveness: 0.25, opacity: 0.8 },
                        edgeSymbol: ['none', 'arrow'], edgeSymbolSize: 6,
                        emphasis: { focus: 'adjacency', lineStyle: { width: 2 } }
                    }]
                });
            },
            startFlow: function () {
                var self = this;
                if (this.timer) clearInterval(this.timer);
                this.timer = setInterval(function () { self.render(); }, 3000);
            }
        },
        mounted: function () { this.render(); this.startFlow(); window.addEventListener('resize', this.onResize); },
        beforeDestroy: function () { if (this.timer) clearInterval(this.timer); window.removeEventListener('resize', this.onResize); },
        watch: { devices: 'render', endpoints: 'render' }
    });
})();


