document.addEventListener('DOMContentLoaded', function() {
    const form = document.getElementById('weatherForm');
    const submitBtn = document.getElementById('submitBtn');
    const loading = document.getElementById('loading');
    const message = document.getElementById('message');
    const targetDateInput = document.getElementById('targetDate');

    // 기본값 설정 (어제)
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    targetDateInput.value = formatDateLocal(yesterday);

    // date input용 포맷 (YYYY-MM-DD)
    function formatDateLocal(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        
        return `${year}-${month}-${day}`;
    }

    // API용 포맷 (YYYYMMDDHHmm)
    // 시작 날짜는 00:00, 종료 날짜는 다음날 00:00 (24:00)
    function formatForAPI(dateString, isEnd = false) {
        // dateString은 YYYY-MM-DD 형식
        const [year, month, day] = dateString.split('-');
        
        if (isEnd) {
            // 종료 날짜는 다음날 00:00 (24:00)
            const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
            date.setDate(date.getDate() + 1);
            
            const endYear = date.getFullYear();
            const endMonth = String(date.getMonth() + 1).padStart(2, '0');
            const endDay = String(date.getDate()).padStart(2, '0');
            
            return `${endYear}${endMonth}${endDay}0000`;
        } else {
            // 시작 날짜는 해당 날짜 00:00
            return `${year}${month}${day}0000`;
        }
    }

    // 메시지 표시 함수
    function showMessage(text, type) {
        message.textContent = text;
        message.className = `message active ${type}`;
    }

    // 메시지 숨기기
    function hideMessage() {
        message.className = 'message';
    }

    // 기상청 AWS 매분 자료 API 데이터 파싱 함수
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
                        ta: parts[8],        // 기온 (C) ✓
                        hm: parts[14],       // 습도 (%) ✓
                        td: parts[17]        // 이슬점온도 (C)
                    });
                }
            }
        }
        
        return dataLines;
    }

    // 15분 단위 데이터 필터링 함수
    function filter15MinuteData(data) {
        return data.filter(item => {
            const minute = item.datetime.substring(10, 12);
            return minute === '00' || minute === '15' || minute === '30' || minute === '45';
        });
    }

    // 날짜 형식 변환 함수 (YYYYMMDDHHmm -> 한국식 형식)
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
        if (hour12 === 0) hour12 = 12;
        
        // 두 자리 숫자로 포맷팅
        const hourStr = String(hour12).padStart(2, '0');
        
        return `${year}. ${month}. ${day} ${period} ${hourStr}:${minute}:00`;
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

    // CSV 다운로드 함수
    function downloadCSV(csvContent, filename) {
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        
        if (navigator.msSaveBlob) { // IE 10+
            navigator.msSaveBlob(blob, filename);
        } else {
            link.href = URL.createObjectURL(blob);
            link.download = filename;
            link.style.display = 'none';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
    }

    // 폼 제출 처리
    form.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        // 입력값 검증
        const targetDate = targetDateInput.value;

        if (!targetDate) {
            showMessage('날짜를 선택해주세요.', 'error');
            return;
        }

        // UI 업데이트
        submitBtn.disabled = true;
        loading.classList.add('active');
        hideMessage();

        try {
            // API 파라미터 생성 (선택한 날짜의 00:00 ~ 다음날 00:00)
            const apiStartDate = formatForAPI(targetDate, false); // 00:00
            const apiEndDate = formatForAPI(targetDate, true);    // 다음날 00:00
            
            // 디버깅: 전송되는 값 확인
            // console.log('============================================');
            // console.log('📤 API 요청 파라미터:');
            // console.log('============================================');
            // console.log('선택한 날짜:', targetDate);
            // console.log('전송할 시작 날짜 (tm1):', apiStartDate);
            // console.log('전송할 종료 날짜 (tm2):', apiEndDate);
            // console.log('============================================');
            
            // API 호출
            const response = await fetch('/api/fetch-weather', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    startDate: apiStartDate,
                    endDate: apiEndDate
                })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || '데이터를 가져오는데 실패했습니다.');
            }

            if (data.success && data.rawData) {
                // 클라이언트에서 데이터 처리
                const parsedData = parseKMAData(data.rawData);
                const filteredData = filter15MinuteData(parsedData);
                
                if (filteredData.length === 0) {
                    throw new Error('해당 기간의 데이터가 없습니다.');
                }
                
                // CSV 생성
                const csv = generateCSV(filteredData, '서울시 금천구');
                
                // CSV 파일 다운로드
                const filename = `weather_data_${targetDate}.csv`;
                downloadCSV(csv, filename);
                
                showMessage(
                    `✅ 성공! ${targetDate}의 ${filteredData.length}개 데이터를 다운로드했습니다.`,
                    'success'
                );
            } else {
                throw new Error('데이터를 받지 못했습니다.');
            }

        } catch (error) {
            console.error('Error:', error);
            showMessage(
                `❌ 오류: ${error.message}`,
                'error'
            );
        } finally {
            // UI 복원
            submitBtn.disabled = false;
            loading.classList.remove('active');
        }
    });

    // 지점 테스트 기능
    const testStationBtn = document.getElementById('testStationBtn');
    const fetchStationsBtn = document.getElementById('fetchStationsBtn');
    const testStationInput = document.getElementById('testStationNumber');
    const testResult = document.getElementById('testResult');

    // 지점 테스트
    testStationBtn.addEventListener('click', async function() {
        const stationNumber = testStationInput.value.trim();
        
        if (!stationNumber) {
            alert('지점번호를 입력해주세요.');
            return;
        }

        testStationBtn.disabled = true;
        testResult.innerHTML = '<p>🔍 테스트 중...</p>';
        testResult.classList.add('active');

        try {
            const targetDate = targetDateInput.value || formatDateLocal(new Date());
            
            const response = await fetch('/api/test-station', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    stationNumber: stationNumber,
                    startDate: formatForAPI(targetDate, false),
                    endDate: formatForAPI(targetDate, true)
                })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || '테스트 실패');
            }

            let resultHTML = `
                <h3>📊 테스트 결과</h3>
                <p><strong>지점번호:</strong> ${data.stationNumber}</p>
                <p><strong>데이터 개수:</strong> ${data.dataCount}개</p>
                <p><strong>데이터 존재:</strong> ${data.hasData ? '✅ 있음' : '❌ 없음'}</p>
                <p><strong>응답 길이:</strong> ${data.rawDataLength}자</p>
            `;

            if (data.sample) {
                resultHTML += `
                    <p><strong>샘플 데이터:</strong></p>
                    <pre>${JSON.stringify(data.sample, null, 2)}</pre>
                `;
            }

            resultHTML += `
                <p><strong>원본 응답 미리보기:</strong></p>
                <pre>${data.rawDataPreview}</pre>
            `;

            testResult.innerHTML = resultHTML;

            // console.log('테스트 결과:', data);

        } catch (error) {
            console.error('Error:', error);
            testResult.innerHTML = `<p style="color: red;">❌ 오류: ${error.message}</p>`;
        } finally {
            testStationBtn.disabled = false;
        }
    });

    // 지점 목록 조회
    fetchStationsBtn.addEventListener('click', async function() {
        fetchStationsBtn.disabled = true;
        testResult.innerHTML = '<p>🔍 지점 목록 조회 중...</p>';
        testResult.classList.add('active');

        try {
            const response = await fetch('/api/stations');
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || '조회 실패');
            }

            let resultHTML = `
                <h3>📋 기상청 API 응답</h3>
                <pre>${data.data}</pre>
            `;

            testResult.innerHTML = resultHTML;

            // console.log('============================================');
            // console.log('기상청 API 지점 정보:');
            // console.log(data.data);
            // console.log('============================================');

        } catch (error) {
            console.error('Error:', error);
            testResult.innerHTML = `<p style="color: red;">❌ 오류: ${error.message}</p>`;
        } finally {
            fetchStationsBtn.disabled = false;
        }
    });
});


