import { readFileSync, writeFileSync } from "node:fs";
import { feature } from "topojson-client";
import { geoContains } from "d3-geo";

const topo = JSON.parse(readFileSync("public/world-110m.json", "utf-8"));
const countries = feature(topo, topo.objects.countries);

const STEP = 2.2;
const LAT_MIN = -58;
const LAT_MAX = 84;
const LNG_MIN = -180;
const LNG_MAX = 180;

const dots = [];
let row = 0;

for (let lat = LAT_MAX; lat >= LAT_MIN; lat -= STEP) {
  const offset = row % 2 === 1 ? STEP / 2 : 0;
  for (let lng = LNG_MIN + offset; lng <= LNG_MAX; lng += STEP) {
    for (const f of countries.features) {
      if (geoContains(f, [lng, lat])) {
        const x = +((((lng + 180) / 360) * 100).toFixed(1));
        const y = +(((90 - lat) / 180) * 100).toFixed(1);
        dots.push([x, y]);
        break;
      }
    }
  }
  row++;
}

writeFileSync("public/world-dots.json", JSON.stringify(dots));
console.log(`Generated ${dots.length} dots`);
