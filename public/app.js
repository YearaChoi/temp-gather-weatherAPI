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
                // 디버그 정보가 있으면 콘솔에 출력
                // if (data.debug) {
                //     console.log('============================================');
                //     console.log('🔍 디버깅 정보:');
                //     console.log('============================================');
                //     console.log('지점번호:', data.debug.station);
                //     console.log('조회 기간:', data.debug.period);
                //     console.log('원본 데이터 길이:', data.debug.rawDataLength);
                //     console.log('원본 데이터 미리보기:');
                //     console.log(data.debug.rawDataPreview);
                //     console.log('============================================');
                // }
                throw new Error(data.error || '데이터를 가져오는데 실패했습니다.');
            }

            if (data.success && data.csv) {
                // CSV 파일 다운로드
                const filename = `weather_data_${targetDate}.csv`;
                downloadCSV(data.csv, filename);
                
                showMessage(
                    `✅ 성공! ${targetDate}의 ${data.dataCount}개 데이터를 다운로드했습니다.`,
                    'success'
                );
            } else {
                throw new Error('CSV 데이터를 생성하지 못했습니다.');
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


