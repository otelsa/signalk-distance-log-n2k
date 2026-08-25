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

// includeDateTime: false omits Date/Time fields
{
  const app2 = {
    getSelfPath: (path) => ({ 'navigation.log': { value: 500 } }[path]),
    emit: (event, payload) => emitted2.push({ event, payload }),
    debug: () => {},
    error: (err) => { throw err },
    setPluginStatus: () => {},
    setPluginError: () => {}
  }
  const emitted2 = []
  const plugin2 = createPlugin(app2)
  plugin2.start({ intervalMs: 250, sendLog: true, includeDateTime: false })
  plugin2.stop()

  assert.strictEqual(emitted2.length, 1)
  assert.strictEqual('Date' in emitted2[0].payload.fields, false)
  assert.strictEqual('Time' in emitted2[0].payload.fields, false)
}

// No valid log values available: nothing is emitted, no error is raised
{
  const emitted3 = []
  const statuses3 = []
  const app3 = {
    getSelfPath: () => undefined,
    emit: (event, payload) => emitted3.push({ event, payload }),
    debug: () => {},
    error: (err) => { throw err },
    setPluginStatus: (status) => statuses3.push(status),
    setPluginError: (status) => statuses3.push(status)
  }
  const plugin3 = createPlugin(app3)
  plugin3.start({ intervalMs: 250, sendLog: true, sendTripLog: true })
  plugin3.stop()

  assert.strictEqual(emitted3.length, 0)
  assert(statuses3.some((status) => status.includes('Sending PGN 128275')))
}

// A failed initial send sets an error status and must not be overwritten by a success status
{
  const statuses4 = []
  const app4 = {
    getSelfPath: (path) => ({ 'navigation.log': { value: 500 } }[path]),
    emit: () => { throw new Error('bus not ready') },
    debug: () => {},
    error: () => {},
    setPluginStatus: (status) => statuses4.push(status),
    setPluginError: (status) => statuses4.push(status)
  }
  const plugin4 = createPlugin(app4)
  plugin4.start({ intervalMs: 250, sendLog: true })
  plugin4.stop()

  assert(statuses4.some((status) => status.includes('Failed to send PGN 128275')))
  assert(!statuses4.some((status) => status.includes('Sending PGN 128275')))
}

// sendOnlyOnChange with minChangeMeters=0 must suppress unchanged resends and
// still send on an actual change (regression test for the >= 0 boundary bug)
async function testSendOnlyOnChange () {
  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

  const state = { log: 1000 }
  const emitted5 = []
  const app5 = {
    getSelfPath: (path) => ({ 'navigation.log': { value: state.log } }[path]),
    emit: (event, payload) => emitted5.push({ event, payload }),
    debug: () => {},
    error: (err) => { throw err },
    setPluginStatus: () => {},
    setPluginError: () => {}
  }
  const plugin5 = createPlugin(app5)

  plugin5.start({
    intervalMs: 250,
    sendLog: true,
    sendOnlyOnChange: true,
    minChangeMeters: 0
  })
  assert.strictEqual(emitted5.length, 1)

  await delay(300)
  assert.strictEqual(emitted5.length, 1, 'unchanged value must not be resent')

  state.log = 1001
  await delay(300)
  assert.strictEqual(emitted5.length, 2, 'an actual change must still be sent')

  plugin5.stop()
}

testSendOnlyOnChange().then(() => {
  console.log('All tests passed')
}).catch((err) => {
  console.error(err)
  process.exit(1)
})
