/* BRAWLVERSE API 配置：后端部署后把下面的空字符串换成 Vercel 域名，
 * 例如 "https://brawlverse-api.vercel.app"。留空时所有交互降级为本地计数。 */
window.BV_API_BASE =
  location.hostname === "zjutimes2015.github.io"
    ? ""   // TODO: 填入 Vercel 部署域名后即接通后端
    : "";
