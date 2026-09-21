const definePage = require('../../utils/page')
const store = require('../../utils/store')
const mock = require('../../utils/mock')

function fmt(student, key, value) {
  if (key === 'attendanceRate') return Math.round(value * 100) + '%'
  if (key === 'homeworkSubmitted') return value + ' / ' + student.learning.homeworkTotal
  if (key === 'homeworkGrade') return value
  if (key === 'quizScore') return value + ' 分'
  if (key === 'libraryVisitsFinalMonth') return value + ' 次'
  if (key === 'exerciseDaysPerWeek') return value + ' 天'
  if (key === 'exerciseMinutes') return value + ' 分钟'
  if (key === 'symptoms') return (value && value.length) ? value.join('、') : '无'
  if (key === 'libraryStayHours') return value + ' 小时'
  if (key === 'dormInOutTimes') return value + ' 次'
  if (key === 'questionnaireScore') return value + ' 分'
  if (key === 'mbti') return value
  if (key === 'researchInterests') return value.join('、')
  return value
}

definePage({
  data: { student: {}, dimensions: [] },
  onShow: function () { this.refresh() },
  refresh: function () {
    const sid = store.getCurrentStudentId()
    const student = store.getStudentView(sid)
    const settings = store.getSettings()
    const meta = mock.FIELD_META
    const order = ['learning', 'health', 'mental', 'personality']

    const dimensions = []
    order.forEach(function (dimKey) {
      if (dimKey === 'health' && !settings.showHealth) return
      if (dimKey === 'mental' && !settings.showMental) return
      const def = meta[dimKey]
      const sourceObj = (dimKey === 'personality') ? student : student[dimKey]
      const items = []
      Object.keys(def.fields).forEach(function (key) {
        items.push({
          label: def.fields[key].label,
          value: fmt(student, key, sourceObj[key]),
          source: def.fields[key].source,
          purpose: def.fields[key].purpose
        })
      })
      dimensions.push({ key: dimKey, title: def.title, priority: def.priority, items: items })
    })

    this.setData({ student: student, dimensions: dimensions })
  }
})
