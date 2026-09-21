const store = require('./store')

// 所有学生业务页面统一检查会话；登录页使用原生 Page。
module.exports = function definePage(options) {
  const lifecycleWithoutSession = ['onHide', 'onUnload']
  if (!options.onShow) options.onShow = function () {}
  Object.keys(options).forEach(function (key) {
    const handler = options[key]
    if (typeof handler !== 'function' || lifecycleWithoutSession.indexOf(key) >= 0) return
    options[key] = function () {
      if (!store.requireSession()) return
      return handler.apply(this, arguments)
    }
  })
  Page(options)
}
