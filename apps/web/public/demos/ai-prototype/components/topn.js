; (function () {
  Vue.component('topn-devices', {
    props: ['topN', 'height', 'hideTitle'],
    template: `
      <div :style="panelStyle">
        <h3 class="panel-title" v-if="!hideTitle">TopN Devices</h3>
        <div class="topn">
          <div class="item">
            <div class="subtle" style="margin-bottom:6px;">Most Requests</div>
            <div class="rank" v-for="(x,i) in topN.requests" :key="'rq-'+i" @click="pick(x.device)">
              <span>{{ i+1 }}. {{ x.device }}</span>
              <span class="num">{{ formatNumber(x.value) }}</span>
            </div>
          </div>
          <div class="item">
            <div class="subtle" style="margin-bottom:6px;">Most Success</div>
            <div class="rank" v-for="(x,i) in topN.success" :key="'ok-'+i" @click="pick(x.device)">
              <span>{{ i+1 }}. {{ x.device }}</span>
              <span class="num">{{ formatNumber(x.value) }}</span>
            </div>
          </div>
          <div class="item">
            <div class="subtle" style="margin-bottom:6px;">Most Failure</div>
            <div class="rank" v-for="(x,i) in topN.failure" :key="'er-'+i" @click="pick(x.device)">
              <span>{{ i+1 }}. {{ x.device }}</span>
              <span class="num">{{ formatNumber(x.value) }}</span>
            </div>
          </div>
        </div>
      </div>
    `,
    computed: {
      panelStyle: function () { return this.height ? { height: this.height + 'px' } : {}; }
    },
    methods: {
      formatNumber: StatsUtils.formatNumber,
      pick: function (name) { this.$emit('pick-device', name); }
    }
  });
})();


