import { Socket } from 'phoenix/assets/js/phoenix.js'


function closure (value) {
  if(typeof value === 'function'){
    return value
  } else {
    let closure = function(){ return value }
    return closure
  }
}

let storage

// @todo use sessionStorage in production
if (window.localStorage) {
  storage = window.localStorage
} else {
  storage = {
    getItem: function getItem() { return null }, 
    setItem: function setItem() {} 
  }
}

function msgIDStorageKey(channel) {
  return  `jsp_msgid__${channel}`
}

function getLastMsgID(channelName) {
  const key = msgIDStorageKey(channelName)
  const value = storage.getItem(key)
  console.log(`value`, value)
  const data = (null === value) ? null : JSON.parse(value)
  console.log('getLastMsgID %s =>',channelName, data)
  return data
}

function setLastMsgID(channelName, id) {
  console.log('setLastMsgID',channelName, id)
  const key = msgIDStorageKey(channelName)
  storage.setItem(key, JSON.stringify(id))
}

function connect(params) {
  const { user_id } = params
  const socket = new Socket('ws://localhost:4000/socket', { params })
  socket.connect()
  const makeChannel = socket.channel.bind(socket)
  socket.channel = function(channelName, params) {
    
    params = closure(params || {})
    
    const paramsWithTimestamp = function() {
      const id = getLastMsgID(channelName) // maybe null
      return Object.assign({}, {last_message_id: id}, params())
    }

    const channel =  makeChannel(`jwp:${user_id}:${channelName}`, paramsWithTimestamp)
    
    channel.onMessage = function(_event, payload, _ref) {
      if (payload && payload.tid) {
        setLastMsgID(channelName, payload.tid)
        return payload.data
      }
      return payload
    }
    
    return channel
  }
  
  return socket
}

export default { connect }