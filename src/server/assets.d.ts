// Files imported with `with { type: "file" }` resolve to a path.
declare module "*.png" {
  const path: string;
  export default path;
}
declare module "*.svg" {
  const path: string;
  export default path;
}
