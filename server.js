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
    
    res.json({
      success: true,
      stationNumber: stationNumber,
      rawDataLength: response.data.length,
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
