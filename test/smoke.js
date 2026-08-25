const assert = require('assert')
const createPlugin = require('../')

const emitted = []
const statuses = []
const app = {
  getSelfPath: (path) => {
    const values = {
      'navigation.log': { value: 1234.4 },
      'navigation.trip.log': { value: 56.6 }
    }
    return values[path]
  },
  emit: (event, payload) => emitted.push({ event, payload }),
  debug: () => {},
  error: (err) => { throw err },
  setPluginStatus: (status) => statuses.push(status),
  setPluginError: (status) => statuses.push(status)
}

const plugin = createPlugin(app)

assert.strictEqual(plugin.id, 'signalk-distance-log-n2k')
assert.strictEqual(typeof plugin.start, 'function')
assert.strictEqual(typeof plugin.stop, 'function')
assert.strictEqual(plugin.schema.properties.intervalMs.minimum, 250)

plugin.start({
  intervalMs: 250,
  sendLog: true,
  sendTripLog: true
})
plugin.stop()

assert.strictEqual(emitted[0].event, 'nmea2000JsonOut')
assert.strictEqual(emitted[0].payload.pgn, 128275)
assert.strictEqual(emitted[0].payload.prio, 6)
assert.strictEqual(emitted[0].payload.dst, 255)
assert.strictEqual(emitted[0].payload.fields.Log, 1234)
assert.strictEqual(emitted[0].payload.fields['Trip Log'], 57)
assert.strictEqual(typeof emitted[0].payload.fields.Date, 'number')
assert.strictEqual(typeof emitted[0].payload.fields.Time, 'number')
assert(statuses.some((status) => status.includes('Sending PGN 128275')))
