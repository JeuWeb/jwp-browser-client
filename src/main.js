import { Presence, Socket } from 'phoenix/assets/js/phoenix.js'
// XHR is used to support IE11 with ajax auth calls
import xhr from 'xhr'

// Debugging tools and helpers ------------------------------------------------

let debugMode = true

function enableDebug() {
  debugMode = true
}

function printDebug(type, args) {
  if (debugMode) console[type](...args)
}

const debug = {
  log: function() { printDebug('log', arguments) },
  info: function() { printDebug('info', arguments) },
  warn: function() { printDebug('warn', arguments) },
  error: function() { printDebug('error', arguments) },
  debug: function() { printDebug('debug', arguments) },
}

// This is a small clone of the invariant package but without optimisation for
// production as it is not needed.
function check(isOk, errmsg) {
  if (!isOk) throw new Error(errmsg)
}

// cast any value to a constant function except if the value is already a
// function.
function asFunction(value) {
  if (typeof value === 'function') {
    return value
  }
  return function () {
    return value
  }
}

// Managing async parameters --------------------------------------------------

// Returns a function that will fetch parameters from given url, expect
// authentication data to be returned id {status: 'ok', data: authentication}
function fetchParams(url) {
  return function authenticate(payload, next) {
    const options = {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'content-type': 'application/json',
      },
      body: JSON.stringify(payload),
    }
    fetch(url, options)
      .then(resp => {
        if (200 !== resp.status) {
          throw new Error(`Expected a 200 HTTP status code, got ${resp.status}`)
        }
        return resp
      })
      .then(d => d.json())
      .then(body => handleAuthResponse(body, next, err => { throw err }))
  }
}

function defaultXhrErrorHandler(err) {
  throw err
}

function xhrParams(url, errorHandler = defaultXhrErrorHandler) {
  return function authenticate(payload, next) {
    const options = {
      method: 'post',
      headers: {
        'accept': 'application/json',
        'content-type': 'application/json',
      },
      json: true,
      body: payload,
    }
    xhr(url, options, function (err, resp, body) {
      if (err) {
        errorHandler(err, resp, body)
      } else if (200 !== resp.statusCode) {
        errorHandler(
          new Error(`Expected a 200 HTTP status code, got ${resp.statusCode}`),
          resp,
          body
        )
      } else {
        handleAuthResponse(body, next, errorHandler)
      }
    })
  }
}

function handleAuthResponse(body, next, errorHandler) {
  switch (body.status) {
    case 'ok':
      return next(body.data)
    case 'error':
      return errorHandler(new Error(body.error))
    default:
      return errorHandler(new Error(`Incorrect status value: '${body.status}'`))
  }
}

// Calling the params providing function.
//
// If the function has a lenght of 2, (like the authenticate function returned
// by fetchParams), it accepts a next() callback to pass the parameters to. If
// the lenght is less than 2, we expect the function to return thes params
// directly.
function callParams(provider, payload, next) {
  if (provider.length < 2) {
    return next(provider(payload))
  }
  return provider(payload, next)
}

// Socket & Channels ----------------------------------------------------------

// This function instantiate a Phoenix.Socket and adds the authentication layer
// through overrides.
function createSocket(url, params) {
  check(typeof params !== 'undefined', 'Socket params are not defined.')
  check(null !== params, 'Socket params must not be null.')
  // Params may be fetched asynchronously by the overriden connect() function
  // and will be set directly on the socket object right before use.
  const socket = new Socket(url, {
    params: () => {
      throw new Error('Socket params cannot be called directly.')
    },
  })

  const paramsProvider = asFunction(params)

  const baseConnectFunction = socket.connect.bind(socket)
  const baseChannelFunction = socket.channel.bind(socket)

  // We can now override the socket.connect() function. It can be called on
  // reconnexion, and our code will run again with the same params. If the
  // params is a function that fetches auth from the server, the server is
  // able to return a fresh socket.
  // eslint-disable-next-line no-shadow
  socket.connect = function connect() {
    return socketConnect(socket, baseConnectFunction, paramsProvider)
  }

  // We override the channel function to add different features:
  // - Channel topic prefix to match jwp:<app_id>:<topic>
  // - Presence API
  socket.channel = function channel(channelName, chanParams) {
    check(typeof chanParams !== 'undefined', 'Channel params are not defined.')
    check(null !== chanParams, 'Channel params must not be null.')
    return createChannel(socket, baseChannelFunction, channelName, chanParams)
  }

  return socket
}

// We will export this simple connect() function that does socket instantiation
// and connection at once.
function connect(url, params) {
  const socket = createSocket(url, params)
  socket.connect()
  return socket
}

// Handle the socket connection
function socketConnect(socket, baseConnectFunction, paramsProvider) {
  callParams(paramsProvider, { auth_type: 'socket' }, params => {
    debug.log('Socket params', params)
    check(null !== params, 'The params given to channel.join() cannot be null')
    check(
      typeof params === 'object',
      'The params given to channel.join() must resolve to an object'
    )
    const { app_id, auth } = params
    check(
      typeof app_id === 'string',
      'Socket params must have an app_id (String) property'
    )
    check(typeof auth === 'string', 'Socket params must have an auth (String) property')
    // Once we have the actual params, we set them on the socket and call the
    // base connect function. This requires to know the inner details of the
    // socket class, and relies on the fact that javascript classes do not have
    // private members. Phoenix does not support async params providers (yet ?).
    socket.params = asFunction(params)
    baseConnectFunction()
  })
}

// Creates the channel on the socket, with support for async params. The base
// phoenix function returns a channel directly, so we should do the same.
// Fetching async parents will be done by overriding the send() method of the
// channel.joinPush object. Luckily, this joinPush is reused whenever the
// channel needs to rejoin(), so we can override it once and it will work
// forever. The channel does not uses the params data except for creating its
// joinPush directly in the constructor. This behaviour should be monitored for
// future changes.
//
// We will also set the topic asynchronously since we need the app_id that is
// given to the socket, maybe asynchronously too.
// The topic is always read from channel.topic at the last minute thoughout the
// Phoenix codebase so it is fine to set it while joining. Although it is ugly
// and we also need async params support from phoenix there.
function createChannel(socket, baseChannelFunction, channelName, chanParams) {
  // The params may be a function, so we always cast them to a function
  const paramsProvider = asFunction(chanParams || {})

  const channel = baseChannelFunction('__temporary__', function params() {
    throw new Error('Channel inital params must not be called')
  })

  // Overriding the joinPush to fetch params when joining()
  const { joinPush } = channel
  const baseSendFunction = joinPush.send.bind(joinPush)
  joinPush.send = function send() {
    handleJoin(channel, joinPush, baseSendFunction, paramsProvider, channelName)
  }

  // Add presence support directly from the channel
  channel.presence = function presence() {
    return new Presence(channel)
  }

  return channel
}

// Sending the join push. We will call for async params and then set the final
// payload on the joinPush
function handleJoin(channel, joinPush, baseSendFunction, paramsProvider, channelName) {
  callParams(
    paramsProvider,
    { auth_type: 'channel', channel_name: channelName },
    params => {
      check(null !== params, 'The params given to channel.join() cannot be null')
      check(
        typeof params === 'object',
        'The params given to channel.join() must resolve to an object'
      )
      const { app_id, auth } = params
      check(
        typeof app_id === 'string',
        'Channels params must have an app_id (String) property'
      )
      check(
        typeof auth === 'string',
        'Channels params must have an auth (String) property'
      )

      const topic = `jwp:${app_id}:${channelName}`
      debug.log(`Setting topic to ${topic}`)
      channel.topic = topic
      // We can override our channel and push objects as needed. We also want to
      // send the last_message_id parameter.
      joinPush.payload = asFunction(params)

      baseSendFunction()
    }
  )
}

export default { connect, fetchParams, xhrParams, enableDebug}