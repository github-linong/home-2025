; (function () {
    function mulberry32(a) {
        return function () {
            var t = a += 0x6D2B79F5;
            t = Math.imul(t ^ t >>> 15, t | 1);
            t ^= t + Math.imul(t ^ t >>> 7, t | 61);
            return ((t ^ t >>> 14) >>> 0) / 4294967296;
        }
    }
    function seededRandomInt(seed, min, max) {
        var rnd = mulberry32(seed)();
        return Math.floor(min + rnd * (max - min + 1));
    }
    function hashCode(str) {
        var h = 0;
        for (var i = 0; i < str.length; i++) { h = ((h << 5) - h) + str.charCodeAt(i); h |= 0; }
        return h >>> 0;
    }
    function startOf(date, gran) {
        var d = new Date(date);
        if (gran === 'day') { d.setHours(0, 0, 0, 0); } else { d.setMinutes(0, 0, 0); }
        return d;
    }
    function addGran(date, gran, n) {
        var d = new Date(date);
        if (gran === 'day') d.setDate(d.getDate() + n); else d.setHours(d.getHours() + n);
        return d;
    }
    function formatNumber(n) { if (n == null) return '0'; return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ','); }

    window.StatsUtils = { mulberry32: mulberry32, seededRandomInt: seededRandomInt, hashCode: hashCode, startOf: startOf, addGran: addGran, formatNumber: formatNumber };
})();


