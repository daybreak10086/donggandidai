const store = require('./utils/store')
App({
  onLaunch: function () {
    store.init()
  },
  globalData: {}
})
