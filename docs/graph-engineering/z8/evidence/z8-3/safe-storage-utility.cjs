let e; try { e = require("electron"); } catch (err) { console.log("require electron threw: " + err.message); process.exit(0); }
console.log("electron keys in utility: " + Object.keys(e).sort().join(","));
console.log("safeStorage in utility: " + (typeof e.safeStorage));
process.exit(0);
