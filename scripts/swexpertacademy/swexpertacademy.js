// Set to true to enable console log
const debug = false;

/* 
  문제 제출 맞음 여부를 확인하는 함수
  2초마다 문제를 파싱하여 확인
*/
let loader;

const currentUrl = window.location.href;
let userCommitMessage = null; // 전역 변수로 커밋 메시지 저장

// SWEA 연습 문제 주소임을 확인하고, 맞는 파서를 실행
if (currentUrl.includes('/main/solvingProblem/solvingProblem.do') && document.querySelector('header > h1 > span').textContent === '모의 테스트') startLoader();
else if (currentUrl.includes('/main/code/problem/problemSolver.do') && currentUrl.includes('extension=BaekjoonHub')) parseAndUpload();

function parseAndUpload() {
  //async wrapper
  (async () => {
    const bojData = await parseData();
    await beginUpload(bojData);
  })();
}
function startLoader() {
  loader = setInterval(async () => {
    // 기능 Off시 작동하지 않도록 함
    const enable = await checkEnable();
    if (!enable) stopLoader();
    // 제출 후 채점하기 결과가 성공적으로 나왔다면 코드를 파싱하고,
    // 결과 페이지로 안내한다.
    else if (getSolvedResult().includes('pass입니다')) {
      log('정답이 나왔습니다. 코드를 파싱합니다');
      stopLoader();
      try {
        const { contestProbId } = await parseCode();
        // prettier-ignore
        await makeSubmitButton(`${window.location.origin}`
          + `/main/code/problem/problemSolver.do?`
          + `contestProbId=${contestProbId}&`
          + `nickName=${getNickname()}&`
          + `extension=BaekjoonHub`);
      } catch (error) {
        log(error);
      }
    }
  }, 2000);
}

function getSolvedResult() {
  return document.querySelector('div.popup_layer.show > div > p.txt')?.innerText.trim().toLowerCase() || '';
}

function stopLoader() {
  clearInterval(loader);
}

/* 파싱 직후 실행되는 함수 */
async function beginUpload(bojData) {
  log('bojData', bojData);
  if (isNotEmpty(bojData)) {
    // 커밋 메시지를 미리 입력받기
    if (userCommitMessage === null) {
      userCommitMessage = await getCommitMessagePrompt(bojData.message);
      
      // 사용자가 취소했다면 업로드 중단
      if (userCommitMessage === null) {
        console.log("GitHub 업로드가 취소되었습니다.");
        return;
      }
      
      // 입력받은 커밋 메시지로 bojData 업데이트
      bojData.message = userCommitMessage;
    }
    
    startUpload();

    const stats = await getStats();
    const hook = await getHook();

    const currentVersion = stats.version;
    /* 버전 차이가 발생하거나, 해당 hook에 대한 데이터가 없는 경우 localstorage의 Stats 값을 업데이트하고, version을 최신으로 변경한다 */
    if (isNull(currentVersion) || currentVersion !== getVersion() || isNull(await getStatsSHAfromPath(hook))) {
      await versionUpdate();
    }

    /* 현재 제출하려는 소스코드가 기존 업로드한 내용과 같다면 중지 */
    cachedSHA = await getStatsSHAfromPath(`\${hook}/\${bojData.directory}/\${bojData.fileName}`)
    calcSHA = calculateBlobSHA(bojData.code)
    log('cachedSHA', cachedSHA, 'calcSHA', calcSHA)
    if (cachedSHA == calcSHA) {
      markUploadedCSS(stats.branches, bojData.directory);
      console.log(`현재 제출번호를 업로드한 기록이 있습니다. problemIdID \${bojData.problemId}`);
      return;
    }
    /* 신규 제출 번호라면 새롭게 커밋 - 이미 입력받은 커밋 메시지 사용 */
    await uploadOneSolveProblemOnGit(bojData, markUploadedCSS);
    
    // 업로드 완료 후 사용한 메시지 초기화
    userCommitMessage = null;
  }
}

// 커밋 메시지를 입력받는 함수
function getCommitMessagePrompt(defaultMessage) {
  return new Promise((resolve) => {
    // 약간의 지연을 둬서 모달이 나타나는 것과 겹치지 않게 함
    setTimeout(() => {
      try {
        const message = window.prompt("GitHub 커밋 메시지를 입력하세요:", defaultMessage);
        resolve(message === null ? null : (message.trim() || defaultMessage));
      } catch (error) {
        console.error("커밋 메시지 입력 중 오류:", error);
        resolve(defaultMessage); // 오류 발생 시 기본 메시지 사용
      }
    }, 100); // 0.1초 후에 프롬프트 표시
  });
}

async function versionUpdate() {
  log('start versionUpdate');
  const stats = await updateLocalStorageStats();
  // update version.
  stats.version = getVersion();
  await saveStats(stats);
  log('stats updated.', stats);
}
