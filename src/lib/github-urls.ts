export const HOST = "github.com";
export const OWNER = "sravioli";
export const BRANCH = "main";
export const REPOSITORIES_API_URL = `https://api.github.com/users/${OWNER}/repos?per_page=100`;

export const repositoryUrl = (repository: string): string =>
  `https://${HOST}/${OWNER}/${repository}`;

export const rawFileUrl = (repository: string, path: string): string =>
  `https://raw.githubusercontent.com/${OWNER}/${repository}/${BRANCH}/${path}`;

export const fileUrl = (repository: string, path: string): string =>
  `${repositoryUrl(repository)}/blob/${BRANCH}/${path}`;
