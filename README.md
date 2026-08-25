# signalk-distance-log-n2k

Signal K server plugin that emits NMEA 2000 PGN 128275 Distance Log from:

- `navigation.log`
- `navigation.trip.log`

The emitted distance values are rounded meters, matching Signal K's normal units and PGN 128275's NMEA 2000 field definition. Date and UTC time fields are included by default.

## Validity

The package contains the pieces Signal K expects for a Node server plugin:

- `package.json` with the `signalk-node-server-plugin` keyword and `main: index.js`
- `index.js` exporting `module.exports = function (app)`
- Plugin `id`, `name`, `description`, `schema`, `start`, and `stop`

## Install manually

```bash
cd /home/alphapi/noomi-data/signalk/node_modules
mkdir -p signalk-distance-log-n2k
cp -a /path/to/signalk-distance-log-n2k/. signalk-distance-log-n2k/
docker restart signalk
```

Enable and configure in Signal K:

Signal K Server -> Server -> Plugin Config -> Distance Log to NMEA 2000

## Recommended config for Furuno FI-503

- Send navigation.log: enabled
- Send navigation.trip.log: disabled initially
- Interval: 1000 ms
- Include Date and Time fields: enabled
- Only send when values change: disabled initially

## Verify

```bash
candump can0 | candump2analyzer | analyzer -json | grep 128275
```

You can also check Signal K logs:

```bash
docker logs --tail 100 signalk
```
