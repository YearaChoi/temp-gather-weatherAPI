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

// 기상청 API 데이터 파싱 함수
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
      if (parts.length >= 13) {
        dataLines.push({
          datetime: parts[0],  // YYMMDDHHMI
          stn: parts[1],       // 지점번호
          wd: parts[2],        // 풍향
          ws: parts[3],        // 풍속
          pa: parts[7],        // 현지기압
          ta: parts[11],       // 기온
          td: parts[12],       // 이슬점온도
          hm: parts[13]        // 습도
        });
      }
    }
  }
  
  return dataLines;
}

// 날짜 형식 변환 함수 (YYYYMMDDHHmm -> CSV용 형식)
function formatDateTime(yyyymmddhhmi) {
  const year = yyyymmddhhmi.substring(0, 4);
  const month = yyyymmddhhmi.substring(4, 6);
  const day = yyyymmddhhmi.substring(6, 8);
  const hour = yyyymmddhhmi.substring(8, 10);
  const minute = yyyymmddhhmi.substring(10, 12);
  
  return `${year}-${month}-${day} ${hour}:${minute}:00`;
}

// CSV 생성 함수
function generateCSV(data, location) {
  let csv = 'id,temperature,recorded_at,location\n';
  
  data.forEach((row, index) => {
    const id = index + 1;
    const temperature = row.ta === '-9.0' || row.ta === '-9' ? '' : row.ta;
    const recordedAt = formatDateTime(row.datetime);
    
    csv += `${id},${temperature},${recordedAt},${location}\n`;
  });
  
  return csv;
}

// 지점 목록 조회 엔드포인트
app.get('/api/stations', async (req, res) => {
  try {
    if (!KMA_API_KEY) {
      return res.status(500).json({ error: '서버에 API 키가 설정되지 않았습니다.' });
    }
    
    const url = 'https://apihub.kma.go.kr/api/typ01/url/kma_sfctm3.php';
    const params = {
      tm1: '202510220000',  // 임시 날짜
      tm2: '202510220100',  // 임시 날짜
      stn: '0',             // 0은 보통 전체 지점 목록을 의미
      help: '1',            // help=1로 지점 정보 요청
      authKey: KMA_API_KEY
    };
    
    console.log('============================================');
    console.log('기상청 지점 목록 조회 중...');
    console.log('============================================');
    
    const response = await axios.get(url, { 
      params,
      timeout: 30000
    });
    
    console.log('응답 데이터:');
    console.log(response.data);
    console.log('============================================');
    
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
    
    const url = 'https://apihub.kma.go.kr/api/typ01/url/kma_sfctm3.php';
    const params = {
      tm1: startDate || '202510220000',
      tm2: endDate || '202510232359',
      stn: stationNumber,
      help: '0',
      authKey: KMA_API_KEY
    };
    
    console.log('============================================');
    console.log(`지점번호 ${stationNumber} 테스트 중...`);
    console.log('============================================');
    console.log('파라미터:', params);
    
    const response = await axios.get(url, { 
      params,
      timeout: 30000
    });
    
    const parsedData = parseKMAData(response.data);
    
    console.log('응답 데이터 길이:', response.data.length);
    console.log('파싱된 데이터 개수:', parsedData.length);
    
    if (parsedData.length > 0) {
      console.log('✅ 데이터 있음 - 첫 번째 샘플:');
      console.log(JSON.stringify(parsedData[0], null, 2));
    } else {
      console.log('❌ 데이터 없음');
    }
    console.log('============================================');
    
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

// API 엔드포인트
app.post('/api/fetch-weather', async (req, res) => {
  try {
    const { startDate, endDate } = req.body;
    
    if (!startDate || !endDate) {
      return res.status(400).json({ error: '필수 파라미터가 누락되었습니다.' });
    }
    
    if (!KMA_API_KEY) {
      return res.status(500).json({ error: '서버에 API 키가 설정되지 않았습니다.' });
    }
    
    // 서울 금천구 지점번호 (서울 지점: 108 사용)
    // 실제로는 금천구의 정확한 지점번호를 사용해야 하지만, 
    // 일반적으로 서울 대표 지점을 사용합니다.
    // const stnNumber = '417'; 
    const stnNumber = '108';
    
    const url = 'https://apihub.kma.go.kr/api/typ01/url/kma_sfctm3.php';
    const params = {
      tm1: startDate,
      tm2: endDate,
      stn: stnNumber,
      help: '0',
      authKey: KMA_API_KEY
    };
    
    console.log('============================================');
    console.log('기상청 API 호출 시작 - 디버깅 모드');
    console.log('============================================');
    console.log('지점번호(stn):', stnNumber);
    console.log('시작일자(tm1):', startDate);
    console.log('종료일자(tm2):', endDate);
    console.log('API URL:', url);
    console.log('전체 파라미터:', params);
    console.log('--------------------------------------------');
    
    const response = await axios.get(url, { 
      params,
      timeout: 30000 // 30초 타임아웃
    });
    
    console.log('API 응답 상태:', response.status);
    console.log('응답 데이터 타입:', typeof response.data);
    console.log('응답 데이터 길이:', response.data ? response.data.length : 0);
    console.log('--------------------------------------------');
    console.log('원본 응답 데이터 (처음 1000자):');
    console.log(response.data ? response.data.substring(0, 1000) : 'No data');
    console.log('--------------------------------------------');
    
    if (!response.data) {
      console.log('❌ 오류: API로부터 데이터를 받지 못했습니다.');
      return res.status(500).json({ error: 'API로부터 데이터를 받지 못했습니다.' });
    }
    
    // 응답 데이터에 에러 메시지가 포함되어 있는지 확인
    if (response.data.includes('ERROR') || response.data.includes('error')) {
      console.log('❌ API 응답에 에러 메시지 포함:');
      console.log(response.data);
      console.log('--------------------------------------------');
    }
    
    // 데이터 파싱
    console.log('데이터 파싱 시작...');
    const parsedData = parseKMAData(response.data);
    console.log('파싱된 데이터 개수:', parsedData.length);
    
    if (parsedData.length > 0) {
      console.log('✅ 첫 번째 데이터 샘플:');
      console.log(JSON.stringify(parsedData[0], null, 2));
      if (parsedData.length > 1) {
        console.log('✅ 마지막 데이터 샘플:');
        console.log(JSON.stringify(parsedData[parsedData.length - 1], null, 2));
      }
    } else {
      console.log('❌ 파싱된 데이터가 없습니다.');
      console.log('원본 응답 전체:');
      console.log(response.data);
    }
    console.log('============================================');
    
    if (parsedData.length === 0) {
      return res.status(404).json({ 
        error: '해당 기간의 데이터가 없습니다.',
        debug: {
          station: stnNumber,
          period: `${startDate} ~ ${endDate}`,
          rawDataLength: response.data.length,
          rawDataPreview: response.data.substring(0, 500)
        }
      });
    }
    
    // CSV 생성
    const csv = generateCSV(parsedData, '서울시');
    
    res.json({
      success: true,
      dataCount: parsedData.length,
      csv: csv
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

