// ============================================================
// 未然 · 学生画像与预警 Mock 数据（MVP）
// 数据先放在前端本地，后续可替换为真实接口。
// 字段来源与用途见 FIELD_META；完整数据模型见 mock/数据模型说明.md
// ============================================================

var FIELD_META = {
  learning: {
    title: '学习状态',
    priority: '核心',
    fields: {
      attendanceRate: { label: '课堂出勤率', source: '教务系统 / 课堂签到', purpose: '计算学业预警等级、生成学业建议' },
      homeworkSubmitted: { label: '作业提交次数', source: '教学平台作业记录', purpose: '计算学业预警等级、生成学业建议' },
      homeworkTotal: { label: '应交作业次数', source: '教学平台课程安排', purpose: '计算作业完成率的分母' },
      homeworkGrade: { label: '作业等级', source: '教学平台批改记录', purpose: '评估学习掌握程度' },
      quizScore: { label: '小测 / 期中成绩', source: '教务系统成绩记录', purpose: '评估学习掌握程度、计算预警等级' },
      libraryVisitsFinalMonth: { label: '期末月图书馆进出次数', source: '图书馆门禁系统', purpose: '评估期末复习投入度（重点关注期末月）' }
    }
  },
  health: {
    title: '身体健康',
    priority: '次要',
    fields: {
      exerciseDaysPerWeek: { label: '一周运动天数', source: '自主填写问卷（为主）', purpose: '计算健康预警、生成健康提醒' },
      exerciseMinutes: { label: '每次运动时长（分钟）', source: '自主填写问卷，近 7 天', purpose: '结合运动频率生成健康提醒' },
      symptoms: { label: '身体不适症状', source: '自主填写问卷', purpose: '计算健康预警、生成健康提醒' },
      libraryStayHours: { label: '日均在馆时长', source: '图书馆门禁系统，近 7 天日均', purpose: '时长较长时提醒适当活动；不等同于有效学习时长' },
      dormInOutTimes: { label: '近 7 天进出寝室次数', source: '宿舍门禁系统', purpose: '辅助提供活动提醒，不能据此确定出寝时长' }
    }
  },
  mental: {
    title: '心理健康',
    priority: '次要',
    fields: {
      questionnaireScore: { label: '压力自评分（0–20）', source: '自主填写的演示问卷，非临床量表', purpose: '生成关怀提醒，不用于诊断' },
      dormInOutTimes: { label: '近 7 天进出寝室次数', source: '宿舍门禁系统，与身体维度同一数据', purpose: '仅供背景参考，不单独推断情绪状态' }
    }
  },
  personality: {
    title: '性格与兴趣',
    priority: '参考',
    fields: {
      mbti: { label: 'MBTI', source: '自主填写', purpose: '赛事推送、导师推荐、生涯规划' },
      researchInterests: { label: '感兴趣的研究方向', source: '自主填写', purpose: '赛事推送、导师推荐、生涯规划' }
    }
  }
}

var warningLevelMap = {
  none: { label: '无预警', cls: 'badge-ok' },
  low: { label: '黄色预警', cls: 'badge-warn' },
  medium: { label: '橙色预警', cls: 'badge-warn' },
  high: { label: '红色预警', cls: 'badge-danger' }
}

var students = [
  {
    id: 's001',
    account: '20230001',
    password: '123456',
    name: '黄同学',
    nickname: '小黄',
    avatar: '',
    avatarColor: '#c9a06b',
    mbti: 'ISTJ',
    researchInterests: ['数据挖掘', '数据库系统'],
    learning: {
      attendanceRate: 0.96,
      homeworkSubmitted: 12,
      homeworkTotal: 12,
      homeworkGrade: 'A',
      quizScore: 90,
      libraryVisitsFinalMonth: 14
    },
    health: {
      exerciseDaysPerWeek: 4,
      exerciseMinutes: 55,
      symptoms: [],
      libraryStayHours: 2.5,
      dormInOutTimes: 7
    },
    mental: {
      questionnaireScore: 1,
      dormInOutTimes: 7
    },
    warnings: {
      academic: { level: 'none', value: 0, reason: '' },
      health: { level: 'none', value: 0, reason: '' },
      emotion: { level: 'none', value: 0, reason: '' }
    },
    notifications: [
      { id: 'n_h001', type: 'contest', priority: 4, title: '赛事推荐 · 数据挖掘竞赛', content: '你的学习状态优秀，结合数据挖掘兴趣，推荐参加校级数据挖掘竞赛。', time: '今天 09:20' },
      { id: 'n_h002', type: 'resource', priority: 5, title: '资源推荐 · 数据库进阶', content: '为你推荐数据库系统进阶资料与科研入门路径。', time: '昨天 15:40' }
    ]
  },
  {
    id: 's002',
    account: '20230002',
    password: '123456',
    name: '池同学',
    nickname: '阿池',
    avatar: '',
    avatarColor: '#7f9e6d',
    mbti: 'ISFJ',
    researchInterests: ['图书情报', '信息管理'],
    learning: {
      attendanceRate: 0.92,
      homeworkSubmitted: 11,
      homeworkTotal: 12,
      homeworkGrade: 'B+',
      quizScore: 78,
      libraryVisitsFinalMonth: 8
    },
    health: {
      exerciseDaysPerWeek: 1,
      exerciseMinutes: 15,
      symptoms: ['肩颈酸痛', '久坐腰背不适'],
      libraryStayHours: 6.5,
      dormInOutTimes: 2
    },
    mental: {
      questionnaireScore: 3,
      dormInOutTimes: 2
    },
    warnings: {
      academic: { level: 'none', value: 0, reason: '' },
      health: { level: 'low', value: 68, reason: '一周运动仅 1 天，图书馆日均久坐约 6.5 小时' },
      emotion: { level: 'none', value: 0, reason: '' }
    },
    notifications: [
      { id: 'n_c001', type: 'health', priority: 2, title: '健康预警 · 运动不足', content: '近一周运动仅 1 天，且图书馆日均久坐约 6.5 小时，建议每 45 分钟起身活动。', time: '今天 08:30' },
      { id: 'n_c002', type: 'health', priority: 2, title: '健康提醒 · 饮食作息', content: '久坐与作息不规律可能加重肩颈不适，请注意饮食均衡。', time: '昨天 12:00' },
      { id: 'n_c003', type: 'resource', topic: 'health', priority: 5, title: '资源推荐 · 办公室拉伸指南', content: '为你推荐肩颈放松拉伸视频，可在寝室或图书馆随时练习。', time: '2 天前' }
    ]
  },
  {
    id: 's003',
    account: '20230003',
    password: '123456',
    name: '魏同学',
    nickname: '小魏',
    avatar: '',
    avatarColor: '#6d8f9e',
    mbti: 'INFP',
    researchInterests: ['文学', '心理学'],
    learning: {
      attendanceRate: 0.88,
      homeworkSubmitted: 10,
      homeworkTotal: 12,
      homeworkGrade: 'B',
      quizScore: 70,
      libraryVisitsFinalMonth: 5
    },
    health: {
      exerciseDaysPerWeek: 3,
      exerciseMinutes: 45,
      symptoms: [],
      libraryStayHours: 3.0,
      dormInOutTimes: 1
    },
    mental: {
      questionnaireScore: 13,
      dormInOutTimes: 1
    },
    warnings: {
      academic: { level: 'none', value: 0, reason: '' },
      health: { level: 'none', value: 0, reason: '' },
      emotion: { level: 'low', value: 13, reason: '问卷提示情绪压力偏高，且近期较少出寝' }
    },
    notifications: [
      { id: 'n_w001', type: 'emotion', priority: 3, title: '情绪预警 · 心理关怀', content: '问卷显示近期情绪压力偏高，建议关注自身状态，必要时可预约心理咨询。', time: '今天 10:15' },
      { id: 'n_w002', type: 'emotion', priority: 3, title: '心理关怀建议', content: '如果你愿意，可以找辅导员聊聊，或参加本周的心理减压工作坊。', time: '昨天 20:00' }
    ]
  },
  {
    id: 's004',
    account: '20230004',
    password: '123456',
    name: '赖同学',
    nickname: '小赖',
    avatar: '',
    avatarColor: '#a06d8f',
    mbti: 'INTJ',
    researchInterests: ['计算机视觉', '深度学习'],
    learning: {
      attendanceRate: 0.98,
      homeworkSubmitted: 12,
      homeworkTotal: 12,
      homeworkGrade: 'A',
      quizScore: 92,
      libraryVisitsFinalMonth: 15
    },
    health: {
      exerciseDaysPerWeek: 4,
      exerciseMinutes: 60,
      symptoms: [],
      libraryStayHours: 2.5,
      dormInOutTimes: 7
    },
    mental: {
      questionnaireScore: 1,
      dormInOutTimes: 7
    },
    warnings: {
      academic: { level: 'none', value: 0, reason: '' },
      health: { level: 'none', value: 0, reason: '' },
      emotion: { level: 'none', value: 0, reason: '' }
    },
    notifications: [
      { id: 'n_l001', type: 'contest', priority: 4, title: '赛事推荐 · 全国大学生计算机设计大赛', content: '结合你的研究兴趣（计算机视觉），推荐报名计算机设计大赛人工智能组。', time: '今天 09:40' },
      { id: 'n_l002', type: 'contest', priority: 4, title: '赛事推荐 · 数学建模竞赛', content: '你的成绩与学习状态良好，适合组队参加数学建模竞赛。', time: '昨天 16:00' },
      { id: 'n_l003', type: 'resource', priority: 5, title: '导师推荐 · 计算机视觉方向', content: '为你匹配到计算机视觉方向导师课题组，可查看详情进一步了解。', time: '4 天前' }
    ]
  },
  {
    id: 's005',
    account: '20230005',
    password: '123456',
    name: '汪同学',
    nickname: '汪汪',
    avatar: '',
    avatarColor: '#c47b4f',
    mbti: 'ESFJ',
    researchInterests: ['教育技术', '用户体验'],
    learning: {
      attendanceRate: 0.78,
      homeworkSubmitted: 8,
      homeworkTotal: 12,
      homeworkGrade: 'B-',
      quizScore: 62,
      libraryVisitsFinalMonth: 3
    },
    health: {
      exerciseDaysPerWeek: 2,
      exerciseMinutes: 30,
      symptoms: ['轻微失眠'],
      libraryStayHours: 4.5,
      dormInOutTimes: 6
    },
    mental: {
      questionnaireScore: 5,
      dormInOutTimes: 6
    },
    warnings: {
      academic: {
        id: 'academic-s005-202606',
        level: 'low',
        value: 62,
        firstNotifiedAt: '2026-06-01',
        history: [
          { date: '2026-06-01', value: 72 },
          { date: '2026-06-08', value: 68 },
          { date: '2026-06-15', value: 65 },
          { date: '2026-06-22', value: 63 },
          { date: '2026-06-29', value: 62 }
        ],
        trend: [72, 68, 65, 63, 62],
        trendLabels: ['第12周', '第13周', '第14周', '第15周', '第16周'],
        reason: '出勤率 78%，作业提交 8/12 次，小测 62 分，低于本演示的 70 分学习目标（非及格线）'
      },
      health: { level: 'none', value: 0, reason: '' },
      emotion: { level: 'none', value: 0, reason: '' }
    },
    notifications: [
      { id: 'n_wang001', type: 'academic', priority: 1, title: '学业预警 · 黄色等级', content: '你的课堂出勤率与作业提交情况低于预期，请查看详情并选择处理方式。', time: '今天 09:00' },
      { id: 'n_wang002', type: 'academic', priority: 1, title: '学业预警趋势提醒', content: '进入详情可查看观察期内的实际变化；若 21 天内降幅不足 5%，将生成辅导员待处理事件。', time: '昨天 18:20' },
      { id: 'n_wang003', type: 'resource', priority: 5, title: '资源推荐 · 数据结构补差资料', content: '基于你的学习状态，为你推荐《数据结构》复习讲义与习题课。', time: '3 天前' }
    ]
  },
  {
    id: 's006',
    account: '20230006',
    password: '123456',
    name: '郭同学',
    nickname: '小郭',
    avatar: '',
    avatarColor: '#8f7f9e',
    mbti: 'ENFP',
    researchInterests: ['数据科学', '产品设计'],
    learning: {
      attendanceRate: 0.95,
      homeworkSubmitted: 12,
      homeworkTotal: 12,
      homeworkGrade: 'A-',
      quizScore: 88,
      libraryVisitsFinalMonth: 12
    },
    health: {
      exerciseDaysPerWeek: 2,
      exerciseMinutes: 35,
      symptoms: [],
      libraryStayHours: 4.0,
      dormInOutTimes: 5
    },
    mental: {
      questionnaireScore: 3,
      dormInOutTimes: 5
    },
    warnings: {
      academic: { level: 'none', value: 0, reason: '' },
      health: { level: 'none', value: 0, reason: '' },
      emotion: { level: 'none', value: 0, reason: '' }
    },
    notifications: [
      { id: 'n_g001', type: 'resource', priority: 5, title: '资源推荐 · 数据分析入门路径', content: '为你整理了一条数据分析学习路径，含公开课与实战项目。', time: '今天 11:00' },
      { id: 'n_g002', type: 'contest', priority: 4, title: '赛事推荐 · 数据分析竞赛', content: '基于你的数据科学兴趣，推荐参加校级数据分析竞赛。', time: '2 天前' }
    ]
  }
]

module.exports = {
  DEMO_DATE: '2026-06-29',
  FIELD_META: FIELD_META,
  warningLevelMap: warningLevelMap,
  students: students
}
