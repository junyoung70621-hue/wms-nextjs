import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 외부(LAN) IP로 dev 서버 접속 시 cross-origin dev 리소스(HMR 등) 허용.
  // 없으면 외부 접속 시 하이드레이션이 막혀 로그인 버튼/폼이 동작하지 않음.
  allowedDevOrigins: [
    "192.168.0.*",
    "192.168.1.*",
    "192.168.2.*",
    "10.0.0.*",
    "10.0.1.*",
    "172.16.0.*",
    "172.30.1.*",
  ],
};

export default nextConfig;
