<#
.SYNOPSIS
    church-app 배포 스크립트 (커밋 + 푸시 + Vercel 배포 전체 자동화)

.설명
    이 프로젝트는 성도 개인정보(연락처/상담/심방 기록)와 출석 통계를 다루므로,
    "숫자가 틀리거나 코드가 깨진 채로 배포되는 일"을 막는 게 최우선입니다.
    그래서 이 스크립트는 실제 배포(git push, vercel --prod) 전에 아래를 순서대로 확인합니다.

      1) 주요 JS 파일 문법 검사 (node --check)  — 오타 하나로 사이트 전체가 죽는 걸 방지
      2) npm run lint                            — 경고성, 실패해도 진행 여부를 물어봄
      3) npm run build:css                       — Tailwind 빌드가 로컬에서도 되는지 확인
      4) 출석 중복행 스캔 (scratch_scan_all_dup_attendance.cjs, 읽기 전용)
         — 감사 보고서 5번 항목(UNIQUE 제약) 마이그레이션을 아직 안 돌렸다면
           여기서 중복이 잡힐 수 있으므로 배포 전에 알려줌
      5) git add / commit / push
      6) vercel --prod 배포

.사용법
    PowerShell에서 이 파일이 있는 폴더로 이동한 뒤:

        .\deploy.ps1                          # 기본: 커밋 메시지는 날짜/시간으로 자동 생성
        .\deploy.ps1 -Message "출석 저장 upsert 전환"   # 커밋 메시지 직접 지정
        .\deploy.ps1 -SkipChecks              # 1~4번 사전 점검을 건너뛰고 바로 배포 (급할 때만)
        .\deploy.ps1 -Force                   # 중간 확인 질문(y/N)을 모두 "예"로 자동 진행

    주의: -SkipChecks와 -Force는 편하지만 사전 점검을 건너뛰는 옵션이라
          평소에는 옵션 없이 그냥 .\deploy.ps1 로 실행하는 걸 권장합니다.
#>

param(
    [string]$Message = "배포: $(Get-Date -Format 'yyyy-MM-dd HH:mm')",
    [switch]$SkipChecks,
    [switch]$Force
)

$ErrorActionPreference = 'Stop'

function Write-Step($text) {
    Write-Host ""
    Write-Host "==> $text" -ForegroundColor Cyan
}

function Write-Ok($text) {
    Write-Host "    OK: $text" -ForegroundColor Green
}

function Write-WarnMsg($text) {
    Write-Host "    경고: $text" -ForegroundColor Yellow
}

function Fail($text) {
    Write-Host ""
    Write-Host "배포 중단: $text" -ForegroundColor Red
    Write-Host "위 문제를 해결한 뒤 다시 실행해주세요." -ForegroundColor Red
    exit 1
}

# y/N 확인. -Force가 켜져 있으면 묻지 않고 그냥 진행(Yes)한다.
function Confirm-Step($question) {
    if ($Force) { return $true }
    $answer = Read-Host "$question (y/N)"
    return ($answer -eq 'y' -or $answer -eq 'Y')
}

# 이 스크립트 파일이 있는 위치 = 프로젝트 루트라고 가정
Set-Location $PSScriptRoot

Write-Host "church-app 배포를 시작합니다." -ForegroundColor Magenta
Write-Host "작업 폴더: $PSScriptRoot"

# ------------------------------------------------------------
# 0) git 저장소인지, 원격(origin)이 있는지 먼저 확인
# ------------------------------------------------------------
if (-not (Test-Path ".git")) {
    Fail "여기가 git 저장소가 아닙니다. deploy.ps1을 church-app 폴더(.git이 있는 곳)에 두고 실행하세요."
}

# ------------------------------------------------------------
# 1~4) 사전 점검 (기본 실행, -SkipChecks로 건너뛰기 가능)
# ------------------------------------------------------------
if (-not $SkipChecks) {

    Write-Step "1/6  주요 JS 파일 문법 검사 (node --check)"
    $filesToCheck = @('server.js') + (Get-ChildItem -Path "public/js" -Filter "*.js" | ForEach-Object { "public/js/$($_.Name)" })
    $syntaxFailed = $false
    foreach ($f in $filesToCheck) {
        if (-not (Test-Path $f)) { continue }
        node --check $f
        if ($LASTEXITCODE -ne 0) {
            Write-Host "    문법 오류: $f" -ForegroundColor Red
            $syntaxFailed = $true
        }
    }
    if ($syntaxFailed) {
        Fail "문법 오류가 있는 파일이 있습니다. 위 파일을 먼저 고쳐주세요."
    }
    Write-Ok "문법 검사 통과 ($($filesToCheck.Count)개 파일)"

    Write-Step "2/6  npm run lint (경고성 — 실패해도 계속 진행할지 물어봄)"
    npm run lint
    if ($LASTEXITCODE -ne 0) {
        Write-WarnMsg "lint에서 문제가 발견되었습니다 (위 출력 참고)."
        if (-not (Confirm-Step "lint 경고가 있어도 계속 진행할까요?")) {
            Fail "사용자가 중단했습니다."
        }
    } else {
        Write-Ok "lint 통과"
    }

    Write-Step "3/6  npm run build:css (Tailwind 로컬 빌드 확인)"
    npm run build:css
    if ($LASTEXITCODE -ne 0) {
        Fail "CSS 빌드에 실패했습니다. Vercel에서도 같은 이유로 배포가 실패할 가능성이 높습니다."
    }
    Write-Ok "CSS 빌드 통과"

    Write-Step "4/6  출석 중복행 스캔 (읽기 전용 — DB에 아무것도 쓰지 않음)"
    if (Test-Path "scratch_scan_all_dup_attendance.cjs") {
        node scratch_scan_all_dup_attendance.cjs
        if ($LASTEXITCODE -ne 0) {
            Write-WarnMsg "중복 스캔 스크립트 실행 중 오류가 발생했습니다 (네트워크 등). 배포 자체와는 무관할 수 있습니다."
            if (-not (Confirm-Step "그래도 계속 진행할까요?")) { Fail "사용자가 중단했습니다." }
        } else {
            Write-Host ""
            Write-WarnMsg "위 결과에 '중복 출석행이 있는 모임'이 1건이라도 있다면,"
            Write-WarnMsg "migrations/2026-07-06_attendance_unique.sql 을 Supabase SQL Editor에서"
            Write-WarnMsg "아직 실행하지 않았을 가능성이 높습니다 (감사 보고서 5번 항목)."
            if (-not (Confirm-Step "중복 스캔 결과를 확인했고, 계속 진행할까요?")) {
                Fail "마이그레이션을 먼저 실행하거나 중복을 정리한 뒤 다시 실행해주세요."
            }
        }
    } else {
        Write-WarnMsg "scratch_scan_all_dup_attendance.cjs 파일이 없어 이 단계는 건너뜁니다."
    }
} else {
    Write-WarnMsg "사전 점검(1~4단계)을 건너뜁니다 (-SkipChecks)."
}

# ------------------------------------------------------------
# 5) git add / commit / push
# ------------------------------------------------------------
Write-Step "5/6  git 커밋 + 푸시"

$branch = (git rev-parse --abbrev-ref HEAD).Trim()
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($branch)) {
    Fail "현재 브랜치를 확인하지 못했습니다. git 저장소 상태를 확인해주세요."
}
Write-Host "    현재 브랜치: $branch"

$statusOutput = git status --porcelain
if ([string]::IsNullOrWhiteSpace($statusOutput)) {
    Write-WarnMsg "커밋할 변경사항이 없습니다. 기존 커밋 그대로 재배포합니다."
} else {
    Write-Host "    변경된 파일:"
    git status --short | ForEach-Object { Write-Host "      $_" }

    if (-not (Confirm-Step "위 변경사항을 커밋하고 origin/$branch 로 푸시할까요?")) {
        Fail "사용자가 중단했습니다."
    }

    git add -A
    if ($LASTEXITCODE -ne 0) { Fail "git add 실패" }

    git commit -m "$Message"
    if ($LASTEXITCODE -ne 0) { Fail "git commit 실패" }
    Write-Ok "커밋 완료: $Message"

    git push -u origin $branch
    if ($LASTEXITCODE -ne 0) {
        Fail "git push 실패했습니다. (원격에 새 커밋이 있으면 먼저 'git pull origin $branch' 후 다시 실행하세요)"
    }
    Write-Ok "푸시 완료 (origin/$branch)"
}

# ------------------------------------------------------------
# 6) Vercel 프로덕션 배포
# ------------------------------------------------------------
Write-Step "6/6  Vercel 프로덕션 배포"

$vercelCmd = Get-Command vercel -ErrorAction SilentlyContinue
if ($vercelCmd) {
    $deployOutput = vercel --prod --yes 2>&1
} else {
    Write-WarnMsg "전역 vercel CLI를 찾지 못해 npx로 실행합니다 (최초 1회는 다운로드 때문에 조금 걸릴 수 있음)."
    $deployOutput = npx vercel@latest --prod --yes 2>&1
}

$deployOutput | ForEach-Object { Write-Host "    $_" }

if ($LASTEXITCODE -ne 0) {
    Fail "Vercel 배포에 실패했습니다. 위 로그를 확인해주세요."
}

$prodUrl = ($deployOutput | Select-String -Pattern 'https://\S+' -AllMatches |
            ForEach-Object { $_.Matches.Value } | Select-Object -Last 1)

Write-Host ""
Write-Host "배포가 완료되었습니다." -ForegroundColor Magenta
if ($prodUrl) {
    Write-Host "배포 주소: $prodUrl" -ForegroundColor Green
}
Write-Host ""
Write-Host "배포 후 확인 체크리스트:" -ForegroundColor Cyan
Write-Host "  - 대시보드/모임 대시보드 출석률 숫자가 화면마다 일치하는지"
Write-Host "  - 모임 저장 후 새로고침해도 구역/부서 통계가 그대로인지"
Write-Host "  - (아직이라면) migrations/2026-07-06_attendance_unique.sql 을 Supabase에서 실행했는지"
