import { Presence, Socket } from 'phoenix/assets/js/phoenix.js'

function closure(value) {
  if (typeof value === 'function') {
    return value
  }

  return function () {
    return value
  }
}

// @todo use sessionStorage in production
let storage = window.localStorage || {
  getItem: function getItem() {
    return null
  },
  setItem: function setItem() {},
}

function msgIDStorageKey(channel) {
  return `jsp_msgid__${channel}`
}

function getLastMsgID(channelName) {
  const key = msgIDStorageKey(channelName)
  const value = storage.getItem(key)
  console.log('value', value)
  const data = null === value ? null : JSON.parse(value)
  console.log('getLastMsgID %s =>', channelName, data)
  return data
}

function setLastMsgID(channelName, id) {
  console.log('setLastMsgID', channelName, id)
  const key = msgIDStorageKey(channelName)
  storage.setItem(key, JSON.stringify(id))
}

function connect(params) {
  const socket = new Socket('ws://localhost:4000/socket', {
    params: params,
  })

  socket.connect()

  const makeChannel = socket.channel.bind(socket)

  // Overriding the .channel() method of the socket object
  socket.channel = (...args) => createJwpChannel(makeChannel, params, ...args)

  return socket
}

// Creates a new channel on the socket
function createJwpChannel(makeChannel, conf, channelName, channelParams) {
  // The params may be a function, so we always cast them to a function
  channelParams = closure(channelParams || {})

  // We will augment those params with our last message id for messages history
  // @todo opt-in history.
  // We will give params as a function in order to fetch the last message id
  // upon joining and not when creating the channel
  const params = function () {
    // id may be null and that is valid
    const id = getLastMsgID(channelName)
    return Object.assign({}, { last_message_id: id }, channelParams())
  }

  const { app_id } = conf

  // prefixing the channel name with our service name and the app id so
  // different applications can use the same channel names without using the
  // same physical channel
  const channel = makeChannel(`jwp:${app_id}:${channelName}`, params)

  // When receiving a message, if it is a message with a time id, we will
  // unwrap the message to get what whas actually pushed, and store this time id
  // as the new last message id.
  channel.onMessage = function (event, payload, _ref) {
    console.log('--------------------------')
    console.log('event', event)
    console.log('payload', payload)
    if (payload && payload.tid) {
      setLastMsgID(channelName, payload.tid)
      return payload.data
    }
    return payload
  }

  // Add presence support directly from the channel
  channel.presence = function presence() {
    return new Presence(channel)
  }

  return channel
}

export default { connect }
