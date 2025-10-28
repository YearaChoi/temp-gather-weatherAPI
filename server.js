require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const KMA_API_KEY = process.env.KMA_API_KEY;

// 미들웨어 설정
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// 기상청 AWS 매분 자료 API 데이터 파싱 함수
// 헤더: YYMMDDHHMI STN WD1 WS1 WDS WSS WD10 WS10 TA RE RN-15m RN-60m RN-12H RN-DAY HM PA PS TD
function parseKMAData(rawData) {
  const lines = rawData.split('\n');
  const dataLines = [];
  let headerFound = false;
  
  for (let line of lines) {
    // 데이터 라인 시작 찾기
    if (line.includes('YYMMDDHHMI')) {
      headerFound = true;
      continue;
    }
    
    // 실제 데이터 라인 파싱 (날짜로 시작하는 라인)
    if (headerFound && line.match(/^\d{12}/)) {
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 18) {
        dataLines.push({
          datetime: parts[0],  // YYMMDDHHMI (KST)
          stn: parts[1],       // 지점번호 (STN)
          wd1: parts[2],       // 풍향1 (deg)
          ws1: parts[3],       // 풍속1 (m/s)
          wds: parts[4],       // 풍향평균 (deg)
          wss: parts[5],       // 풍속평균 (m/s)
          wd10: parts[6],      // 풍향10분 (deg)
          ws10: parts[7],      // 풍속10분 (m/s)
          ta: parts[8],        // 기온 (C) ✓
          re: parts[9],        // 강수 유무
          rn15m: parts[10],    // 15분 강수량 (mm)
          rn60m: parts[11],    // 60분 강수량 (mm)
          rn12h: parts[12],    // 12시간 강수량 (mm)
          rnday: parts[13],    // 일 강수량 (mm)
          hm: parts[14],       // 습도 (%) ✓
          pa: parts[15],       // 현지기압 (hPa)
          ps: parts[16],       // 해면기압 (hPa)
          td: parts[17]        // 이슬점온도 (C)
        });
      }
    }
  }
  
  return dataLines;
}

// 날짜 형식 변환 함수 (YYYYMMDDHHmm -> CSV용 한국식 형식)
// 예: 202510260000 -> 2025. 10. 26 오전 12:00:00
function formatDateTime(yyyymmddhhmi) {
  const year = yyyymmddhhmi.substring(0, 4);
  const month = yyyymmddhhmi.substring(4, 6);
  const day = yyyymmddhhmi.substring(6, 8);
  const hour24 = parseInt(yyyymmddhhmi.substring(8, 10));
  const minute = yyyymmddhhmi.substring(10, 12);
  
  // 오전/오후 결정
  const period = hour24 < 12 ? '오전' : '오후';
  
  // 12시간 형식으로 변환
  let hour12 = hour24 % 12;
  if (hour12 === 0) hour12 = 12; // 0시와 12시를 12로 표시
  
  // 두 자리 숫자로 포맷팅
  const hourStr = String(hour12).padStart(2, '0');
  
  return `${year}. ${month}. ${day} ${period} ${hourStr}:${minute}:00`;
}

// 15분 단위 데이터 필터링 함수 (00, 15, 30, 45분만 추출)
function filter15MinuteData(data) {
  return data.filter(item => {
    const minute = item.datetime.substring(10, 12);
    return minute === '00' || minute === '15' || minute === '30' || minute === '45';
  });
}

// CSV 생성 함수
function generateCSV(data, location) {
  let csv = 'id,temperature,humidity,recorded_at,location\n';
  
  data.forEach((row, index) => {
    const id = index + 1;
    const temperature = row.ta === '-9.0' || row.ta === '-9' || row.ta === '-99.0' || row.ta === '-99' ? '' : row.ta;
    const humidity = row.hm === '-9.0' || row.hm === '-9' || row.hm === '-99.0' || row.hm === '-99' ? '' : row.hm;
    const recordedAt = formatDateTime(row.datetime);
    
    csv += `${id},${temperature},${humidity},${recordedAt},${location}\n`;
  });
  
  return csv;
}

// 지점 목록 조회 엔드포인트
app.get('/api/stations', async (req, res) => {
  try {
    if (!KMA_API_KEY) {
      return res.status(500).json({ error: '서버에 API 키가 설정되지 않았습니다.' });
    }
    
    const url = 'https://apihub.kma.go.kr/api/typ01/cgi-bin/url/nph-aws2_min';
    const params = {
      tm2: '202510220000',  // 임시 날짜
      stn: '0',             // 0은 보통 전체 지점 목록을 의미
      disp: '0',            // 표출형태
      help: '1',            // help=1로 지점 정보 요청
      authKey: KMA_API_KEY
    };
    
    const response = await axios.get(url, { 
      params,
      timeout: 30000
    });
    
    
    res.json({
      success: true,
      data: response.data
    });
    
  } catch (error) {
    console.error('Error fetching station list:', error.message);
    res.status(500).json({ 
      error: '지점 목록 조회 중 오류가 발생했습니다.',
      details: error.message 
    });
  }
});

// 특정 지점 테스트 엔드포인트
app.post('/api/test-station', async (req, res) => {
  try {
    const { stationNumber, startDate, endDate } = req.body;
    
    if (!stationNumber) {
      return res.status(400).json({ error: '지점번호가 필요합니다.' });
    }
    
    if (!KMA_API_KEY) {
      return res.status(500).json({ error: '서버에 API 키가 설정되지 않았습니다.' });
    }
    
    const url = 'https://apihub.kma.go.kr/api/typ01/cgi-bin/url/nph-aws2_min';
    const params = {
      tm1: startDate || '202510220000',
      tm2: endDate || '202510232359',
      stn: stationNumber,
      disp: '0',
      help: '0',
      authKey: KMA_API_KEY
    };
    
    const response = await axios.get(url, { 
      params,
      timeout: 30000
    });
    
    const parsedData = parseKMAData(response.data);
    
    res.json({
      success: true,
      stationNumber: stationNumber,
      dataCount: parsedData.length,
      hasData: parsedData.length > 0,
      rawDataLength: response.data.length,
      sample: parsedData.length > 0 ? parsedData[0] : null,
      rawDataPreview: response.data.substring(0, 500)
    });
    
  } catch (error) {
    console.error('Error testing station:', error.message);
    res.status(500).json({ 
      error: '지점 테스트 중 오류가 발생했습니다.',
      details: error.message 
    });
  }
});

// API 엔드포인트 - 프록시 역할만 (원본 데이터 그대로 전달)
app.post('/api/fetch-weather', async (req, res) => {
  try {
    const { startDate, endDate } = req.body;
    
    if (!startDate || !endDate) {
      return res.status(400).json({ error: '필수 파라미터가 누락되었습니다.' });
    }
    
    if (!KMA_API_KEY) {
      return res.status(500).json({ error: '서버에 API 키가 설정되지 않았습니다.' });
    }
    
    // 서울 금천구 지점번호: 417
    const stnNumber = '417';
    const url = 'https://apihub.kma.go.kr/api/typ01/cgi-bin/url/nph-aws2_min';
    
    // AWS 매분 자료 API 파라미터
    const params = {
      tm1: startDate,
      tm2: endDate,
      stn: stnNumber,
      disp: '0',
      help: '0',
      authKey: KMA_API_KEY
    };
    
    const response = await axios.get(url, { 
      params,
      timeout: 30000
    });
    
    if (!response.data) {
      return res.status(500).json({ error: 'API로부터 데이터를 받지 못했습니다.' });
    }
    
    // 원본 데이터를 그대로 전달 (파싱, 필터링, CSV 생성은 클라이언트에서)
    res.json({
      success: true,
      rawData: response.data
    });
    
  } catch (error) {
    console.error('Error fetching weather data:', error.message);
    res.status(500).json({ 
      error: 'API 호출 중 오류가 발생했습니다.',
      details: error.message 
    });
  }
});

// 루트 경로
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 서버 시작
app.listen(PORT, () => {
  console.log(`서버가 포트 ${PORT}에서 실행 중입니다.`);
  console.log(`http://localhost:${PORT} 에서 접속하세요.`);
});
