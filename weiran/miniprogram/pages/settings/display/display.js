const definePage = require('../../../utils/page')
const store = require('../../../utils/store')

definePage({
  data: { settings: {} },
  onShow: function () { this.setData({ settings: store.getSettings() }) },
  onToggleShowHealth: function (e) { this.apply({ showHealth: e.detail.value }) },
  onToggleShowMental: function (e) { this.apply({ showMental: e.detail.value }) },
  apply: function (patch) {
    const next = store.updateSettings(patch)
    this.setData({ settings: next })
    wx.showToast({ title: '已保存', icon: 'success' })
  }
})
