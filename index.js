module.exports = function (app) {
  const plugin = {}
  const MAX_N2K_DISTANCE_METERS = 4294967292

  plugin.id = 'signalk-distance-log-n2k'
  plugin.name = 'Distance Log to NMEA 2000'
  plugin.description = 'Emits PGN 128275 Distance Log from navigation.log and/or navigation.trip.log'

  let timer = null
  let lastPayload = null

  plugin.schema = {
    type: 'object',
    required: [],
    properties: {
      intervalMs: {
        type: 'number',
        title: 'Update interval in milliseconds',
        default: 1000,
        minimum: 250
      },
      sendLog: {
        type: 'boolean',
        title: 'Send navigation.log as Log',
        default: true
      },
      sendTripLog: {
        type: 'boolean',
        title: 'Send navigation.trip.log as Trip Log',
        default: false
      },
      includeDateTime: {
        type: 'boolean',
        title: 'Include PGN Date and Time fields',
        default: true
      },
      sendOnlyOnChange: {
        type: 'boolean',
        title: 'Only send when values change',
        default: false
      },
      minChangeMeters: {
        type: 'number',
        title: 'Minimum distance change in meters when only sending changes',
        default: 1,
        minimum: 0
      }
    }
  }

  function getPathValue (path) {
    const v = app.getSelfPath(path)
    return v && typeof v.value === 'number' && Number.isFinite(v.value)
      ? v.value
      : null
  }

  function normalizeOptions (options) {
    const opts = Object.assign({
      intervalMs: 1000,
      sendLog: true,
      sendTripLog: false,
      includeDateTime: true,
      sendOnlyOnChange: false,
      minChangeMeters: 1
    }, options || {})

    return {
      intervalMs: clampNumber(opts.intervalMs, 250, 60000, 1000),
      sendLog: opts.sendLog !== false,
      sendTripLog: opts.sendTripLog === true,
      includeDateTime: opts.includeDateTime !== false,
      sendOnlyOnChange: opts.sendOnlyOnChange === true,
      minChangeMeters: clampNumber(opts.minChangeMeters, 0, MAX_N2K_DISTANCE_METERS, 1)
    }
  }

  function clampNumber (value, min, max, fallback) {
    const number = Number(value)
    if (!Number.isFinite(number)) {
      return fallback
    }
    return Math.min(max, Math.max(min, number))
  }

  function toN2kDistance (value) {
    if (value === null) {
      return null
    }
    return Math.round(clampNumber(value, 0, MAX_N2K_DISTANCE_METERS, 0))
  }

  function getDateTimeFields () {
    const now = new Date()

    return {
      Date: Math.trunc(now.getTime() / 86400000),
      Time: (
        now.getUTCHours() * 3600 +
        now.getUTCMinutes() * 60 +
        now.getUTCSeconds() +
        now.getUTCMilliseconds() / 1000
      )
    }
  }

  function shouldSend (fields, options) {
    if (!options.sendOnlyOnChange || !lastPayload) {
      return true
    }

    const changed = ['Log', 'Trip Log'].some((field) => {
      if (typeof fields[field] !== 'number') {
        return false
      }
      if (typeof lastPayload[field] !== 'number') {
        return true
      }
      return Math.abs(fields[field] - lastPayload[field]) >= options.minChangeMeters
    })

    return changed
  }

  function sendDistanceLog (options) {
    const fields = {}

    if (options.includeDateTime) {
      Object.assign(fields, getDateTimeFields())
    }

    if (options.sendLog) {
      const log = toN2kDistance(getPathValue('navigation.log'))
      if (log !== null) {
        fields.Log = log
      }
    }

    if (options.sendTripLog) {
      const tripLog = toN2kDistance(getPathValue('navigation.trip.log'))
      if (tripLog !== null) {
        fields['Trip Log'] = tripLog
      }
    }

    if (typeof fields.Log !== 'number' && typeof fields['Trip Log'] !== 'number') {
      app.debug('No valid log values available, not sending PGN 128275')
      return
    }

    if (!shouldSend(fields, options)) {
      return
    }

    try {
      app.emit('nmea2000JsonOut', {
        pgn: 128275,
        prio: 6,
        dst: 255,
        fields
      })
      lastPayload = fields

      app.debug(`Sent PGN 128275: ${JSON.stringify(fields)}`)
    } catch (err) {
      app.setPluginError(`Failed to send PGN 128275: ${err.message}`)
      app.error(err)
    }
  }

  plugin.start = function (options) {
    plugin.stop()

    const opts = normalizeOptions(options)
    lastPayload = null

    timer = setInterval(() => sendDistanceLog(opts), opts.intervalMs)
    sendDistanceLog(opts)

    app.setPluginStatus(
      `Sending PGN 128275 every ${opts.intervalMs} ms; Log=${opts.sendLog}; Trip Log=${opts.sendTripLog}`
    )
  }

  plugin.stop = function () {
    if (timer) {
      clearInterval(timer)
      timer = null
    }
    lastPayload = null
    app.setPluginStatus('Stopped')
  }

  return plugin
}
