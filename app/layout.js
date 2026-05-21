import "./globals.css";

export const metadata = {
  title: "Music Video Circles",
  description: "키보드로 뮤직비디오 스타일 원형 비주얼을 연주합니다",
};

export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
