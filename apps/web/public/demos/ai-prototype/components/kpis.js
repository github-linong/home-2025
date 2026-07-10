; (function () {
    Vue.component('kpi-cards', {
        props: ['kpis'],
        template: `
      <div class="kpi">
        <div class="card">
          <div class="label">Total</div>
          <div class="value">{{ formatNumber(kpis.total) }}</div>
        </div>
        <div class="card">
          <div class="label">Success</div>
          <div class="value">{{ formatNumber(kpis.success) }}</div>
        </div>
        <div class="card">
          <div class="label">Failure</div>
          <div class="value">{{ formatNumber(kpis.failure) }}</div>
        </div>
      </div>
    `,
        methods: { formatNumber: StatsUtils.formatNumber }
    });
})();


