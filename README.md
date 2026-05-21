# Music Video Circles

Next.js 기반 뮤직비디오 스타일 원형 비주얼라이저입니다.

## 기능

- 키보드/패드로 연주하며 캔버스에 컬러 원 생성
- 캔버스에 선을 그리면 원이 **선 경로를 따라** 나타남
- Kick / Snare / Hat / Bass / Perc 16스텝 시퀀서
- BPM 조절, Random / Play / Clear

## 실행

```bash
npm install
npm run dev -- -p 3001
```

브라우저에서 [http://localhost:3001](http://localhost:3001) 을 엽니다.

## 사용법

1. 캔버스에 드래그해 경로(선)를 그립니다.
2. **Random** → **▶ Play** 또는 키(`Q`, `W`, `E` …)로 연주합니다.
3. 하단 그리드에서 박자 패턴을 확인·수정할 수 있습니다.
