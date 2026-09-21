const definePage = require('../../../utils/page')
const store = require('../../../utils/store')

definePage({
  data: { settings: {} },
  onShow: function () { this.setData({ settings: store.getSettings() }) },
  onToggleHealthAlert: function (e) { this.apply({ enableHealthAlert: e.detail.value }) },
  onToggleEmotionAlert: function (e) { this.apply({ enableEmotionAlert: e.detail.value }) },
  apply: function (patch) {
    const next = store.updateSettings(patch)
    this.setData({ settings: next })
    wx.showToast({ title: '已保存', icon: 'success' })
  }
})
