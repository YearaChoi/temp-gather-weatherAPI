document.addEventListener('DOMContentLoaded', function() {
    const form = document.getElementById('weatherForm');
    const submitBtn = document.getElementById('submitBtn');
    const loading = document.getElementById('loading');
    const message = document.getElementById('message');
    const startDateInput = document.getElementById('startDate');
    const endDateInput = document.getElementById('endDate');

    // 기본값 설정 (어제와 오늘)
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    
    endDateInput.value = formatDateLocal(today);
    startDateInput.value = formatDateLocal(yesterday);

    // date input용 포맷 (YYYY-MM-DD)
    function formatDateLocal(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        
        return `${year}-${month}-${day}`;
    }

    // API용 포맷 (YYYYMMDDHHmm)
    // 시작 날짜는 00:00, 종료 날짜는 24:00(다음날 00:00)로 설정
    function formatForAPI(dateString, isEnd = false) {
        const date = new Date(dateString);
        
        if (isEnd) {
            // 종료 날짜는 다음날 00:00 (24:00)
            date.setDate(date.getDate() + 1);
        }
        
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        
        // 시작 날짜는 0000 (00:00), 종료 날짜도 0000 (다음날 00:00 = 24:00)
        const time = '0000';
        
        return `${year}${month}${day}${time}`;
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
        const startDate = startDateInput.value;
        const endDate = endDateInput.value;

        if (!startDate || !endDate) {
            showMessage('시작 날짜와 종료 날짜를 모두 입력해주세요.', 'error');
            return;
        }

        // 날짜 검증
        const start = new Date(startDate);
        const end = new Date(endDate);

        if (start > end) {
            showMessage('시작 날짜는 종료 날짜보다 이전이어야 합니다.', 'error');
            return;
        }

        // 3주(21일) 제한 검증
        const diffDays = (end - start) / (1000 * 60 * 60 * 24);
        if (diffDays > 21) {
            showMessage('최대 3주(21일)치 데이터만 조회할 수 있습니다.', 'error');
            return;
        }

        // UI 업데이트
        submitBtn.disabled = true;
        loading.classList.add('active');
        hideMessage();

        try {
            // API 호출
            const response = await fetch('/api/fetch-weather', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    startDate: formatForAPI(startDate, false), // 시작: 00:00
                    endDate: formatForAPI(endDate, true)       // 종료: 24:00 (다음날 00:00)
                })
            });

            const data = await response.json();

            if (!response.ok) {
                // 디버그 정보가 있으면 콘솔에 출력
                if (data.debug) {
                    console.log('============================================');
                    console.log('🔍 디버깅 정보:');
                    console.log('============================================');
                    console.log('지점번호:', data.debug.station);
                    console.log('조회 기간:', data.debug.period);
                    console.log('원본 데이터 길이:', data.debug.rawDataLength);
                    console.log('원본 데이터 미리보기:');
                    console.log(data.debug.rawDataPreview);
                    console.log('============================================');
                    console.log('💡 해결 방법:');
                    console.log('1. 서버 터미널에서 더 자세한 로그를 확인하세요');
                    console.log('2. 지점번호 417이 유효한지 확인하세요');
                    console.log('3. 다른 날짜 범위로 시도해보세요');
                    console.log('4. 지점번호 108(서울 대표)로 테스트해보세요');
                    console.log('============================================');
                }
                throw new Error(data.error || '데이터를 가져오는데 실패했습니다.');
            }

            if (data.success && data.csv) {
                // CSV 파일 다운로드
                const filename = `weather_data_${startDate}_${endDate}.csv`;
                downloadCSV(data.csv, filename);
                
                showMessage(
                    `✅ 성공! ${data.dataCount}개의 데이터를 다운로드했습니다.`,
                    'success'
                );
            } else {
                throw new Error('CSV 데이터를 생성하지 못했습니다.');
            }

        } catch (error) {
            console.error('Error:', error);
            showMessage(
                `❌ 오류: ${error.message} (자세한 내용은 브라우저 콘솔을 확인하세요)`,
                'error'
            );
        } finally {
            // UI 복원
            submitBtn.disabled = false;
            loading.classList.remove('active');
        }
    });

    // 날짜 입력 변경시 유효성 검사
    startDateInput.addEventListener('change', validateDates);
    endDateInput.addEventListener('change', validateDates);

    function validateDates() {
        const start = new Date(startDateInput.value);
        const end = new Date(endDateInput.value);

        if (start && end && start > end) {
            showMessage('시작 날짜는 종료 날짜보다 이전이어야 합니다.', 'error');
        } else if (start && end) {
            const diffDays = (end - start) / (1000 * 60 * 60 * 24);
            if (diffDays > 21) {
                showMessage('최대 3주(21일)치 데이터만 조회할 수 있습니다.', 'error');
            } else {
                hideMessage();
            }
        }
    }

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
            const response = await fetch('/api/test-station', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    stationNumber: stationNumber,
                    startDate: formatForAPI(startDateInput.value, false),
                    endDate: formatForAPI(endDateInput.value, true)
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

            console.log('테스트 결과:', data);

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

            console.log('============================================');
            console.log('기상청 API 지점 정보:');
            console.log(data.data);
            console.log('============================================');

        } catch (error) {
            console.error('Error:', error);
            testResult.innerHTML = `<p style="color: red;">❌ 오류: ${error.message}</p>`;
        } finally {
            fetchStationsBtn.disabled = false;
        }
    });
});


