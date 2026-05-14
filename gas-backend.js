/**
 * PAH 风险评估工具 — Google Apps Script 后端
 *
 * 功能：
 *   1. 接收评估数据并写入 Google Sheets
 *   2. 代理 AI 聊天请求到 Anthropic API
 *
 * 部署步骤：
 *   1. 打开 Google Sheets 新建表格
 *   2. 第一行填入列名（与下方 COLUMNS 数组一致）
 *   3. 扩展程序 → Apps Script → 粘贴本文件全部代码
 *   4. 将 ANTHROPIC_API_KEY 替换为你的 API Key
 *   5. 点击"部署" → "新建部署" → Web 应用 → 访问权限：所有人 → 部署
 *   6. 复制生成的 URL，粘贴到 index.html 的 GAS_WEBAPP_URL 变量中
 */

// ===== 配置：替换为你的 Anthropic API Key =====
const ANTHROPIC_API_KEY = 'YOUR_ANTHROPIC_API_KEY';
const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_MODEL = 'claude-sonnet-4-6'; // 可替换为其他模型

// ===== Sheet 列名（必须与 Sheet 第一行完全一致）=====
const COLUMNS = [
  'Timestamp', '姓名', '年龄', '性别', 'PAH亚型', '评估日期',
  '右心衰竭体征', '晕厥史', 'WHO-FC', '6MWD', '峰值VO2',
  'NT-proBNP', 'BNP', '优先标志物', '右心房面积', '心包积液',
  'TAPSE', 'RAP', 'CI', 'SvO2', 'mPAP', 'PVR',
  '危险分层', '低危项数', '中危项数', '高危项数'
];

// 前端数据字段 → Sheet 列名的映射
const DATA_KEY_MAP = {
  timestamp: 'Timestamp', name: '姓名', age: '年龄', sex: '性别',
  pahType: 'PAH亚型', evalDate: '评估日期',
  rhfSigns: '右心衰竭体征', syncope: '晕厥史', whoFc: 'WHO-FC',
  sixMwd: '6MWD', peakVo2: '峰值VO2',
  ntProbnp: 'NT-proBNP', bnp: 'BNP', biomarkerPrefer: '优先标志物',
  raa: '右心房面积', pericardial: '心包积液', tapse: 'TAPSE',
  rap: 'RAP', ci: 'CI', svo2: 'SvO2', mpap: 'mPAP', pvr: 'PVR',
  finalRisk: '危险分层', countLow: '低危项数', countInter: '中危项数', countHigh: '高危项数'
};

// ===== 系统提示词 =====
const SYSTEM_PROMPT = `你是一位资深的肺动脉高压（PAH）专科医学顾问，拥有丰富的临床经验。你的职责是：

1. 用专业但通俗易懂的中文回答用户关于肺动脉高压的问题
2. 基于 2022 ESC/ERS 指南提供循证医学建议
3. 可以解答：疾病知识、诊断标准、危险分层、治疗方案、药物信息、生活方式管理、预后评估等
4. 遇到紧急情况描述时，应明确建议立即就医
5. 始终强调：你的建议仅供参考，不能替代执业医师的诊断和临床决策

请保持回答简洁（一般不超过 300 字），重点突出，必要时使用分点说明。`;

// ===== 主入口：请求路由 =====
function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);
    const action = payload.action;

    if (action === 'saveData') {
      return saveToSheet(payload.data);
    } else if (action === 'chat') {
      return callAnthropicAPI(payload.message);
    } else {
      return json({ success: false, error: '未知操作类型' });
    }
  } catch (err) {
    return json({ success: false, error: err.toString() });
  }
}

// ===== 写入 Google Sheet =====
function saveToSheet(data) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();

  const row = COLUMNS.map(colName => {
    // 反向查找前端数据键
    let val = '';
    for (const [key, col] of Object.entries(DATA_KEY_MAP)) {
      if (col === colName) {
        val = data[key] !== undefined && data[key] !== null ? data[key] : '';
        break;
      }
    }
    return val;
  });

  sheet.appendRow(row);
  return json({ success: true, message: '数据已保存' });
}

// ===== 调用 Anthropic API（Claude）=====
function callAnthropicAPI(userMessage) {
  if (!ANTHROPIC_API_KEY || ANTHROPIC_API_KEY === 'YOUR_ANTHROPIC_API_KEY') {
    return json({ success: false, reply: 'API Key 未配置，请联系管理员。' });
  }

  const requestBody = {
    model: ANTHROPIC_MODEL,
    max_tokens: 800,
    system: SYSTEM_PROMPT,
    messages: [
      { role: 'user', content: userMessage }
    ]
  };

  const options = {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    payload: JSON.stringify(requestBody),
    muteHttpExceptions: true
  };

  const response = UrlFetchApp.fetch(ANTHROPIC_API_URL, options);
  const responseCode = response.getResponseCode();
  const responseBody = JSON.parse(response.getContentText());

  if (responseCode === 200 && responseBody.content && responseBody.content.length > 0) {
    const reply = responseBody.content[0].text;
    return json({ success: true, reply: reply });
  } else {
    Logger.log('Anthropic API 错误: ' + JSON.stringify(responseBody));
    return json({ success: false, reply: 'AI 服务暂时不可用，请稍后再试。' });
  }
}

// ===== 跨域支持 =====
function doGet(e) {
  return json({ status: 'PAH Risk Assessment API is running.' });
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
