; (function () {
    Vue.component('stats-toolbar', {
        props: ['rangePicker', 'granularity', 'allDevices', 'selectedDevices', 'auto'],
        template: `
      <div class="toolbar">
        <div class="header-title">量子密信 · 统计分析</div>
        <el-date-picker
          v-model="localRange"
          type="daterange"
          unlink-panels
          size="mini"
          range-separator="至"
          start-placeholder="开始日期"
          end-placeholder="结束日期"
          @change="emitRange"
        />
        <el-select v-model="localGran" size="mini" @change="emitGran">
          <el-option label="小时" value="hour" />
          <el-option label="天" value="day" />
        </el-select>
        <div style="width:1px; height:20px; background:#1e2a44; margin:0 4px;"></div>
        <el-select v-model="localDevices" multiple collapse-tags filterable placeholder="添加设备" size="mini" @change="emitDevices">
          <el-option v-for="d in allDevices" :key="d" :label="d" :value="d" />
        </el-select>
        <div style="flex:1 1 auto"></div>
        <el-switch v-model="localAuto" active-text="Auto" size="mini" @change="emitAuto"></el-switch>
        <el-button size="mini" @click="$emit('refresh')">Refresh</el-button>
      </div>
    `,
        data: function () {
            return { localRange: this.rangePicker, localGran: this.granularity, localDevices: this.selectedDevices, localAuto: this.auto };
        },
        methods: {
            emitRange: function () { this.$emit('update:rangePicker', this.localRange); this.$emit('range-change', this.localRange); },
            emitGran: function () { this.$emit('update:granularity', this.localGran); this.$emit('gran-change', this.localGran); },
            emitDevices: function () { this.$emit('update:selectedDevices', this.localDevices); this.$emit('devices-change', this.localDevices); },
            emitAuto: function () { this.$emit('update:auto', this.localAuto); this.$emit('toggle-auto', this.localAuto); }
        },
        watch: {
            rangePicker: function (v) { this.localRange = v; },
            granularity: function (v) { this.localGran = v; },
            selectedDevices: function (v) { this.localDevices = v; },
            auto: function (v) { this.localAuto = v; }
        }
    });
})();


