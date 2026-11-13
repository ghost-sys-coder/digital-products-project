// The product cover at a versioned path (/api/products/<id>/cover/<revision>). next/image only optimises
// local URLs without a query string unless next.config allows one, and a new revision gets a new URL,
// so optimised copies can be cached without serving an old cover.
export { GET } from "../route";
export const runtime = "nodejs";
