## [1.3.2](https://github.com/Data-Only-Greater/sveltekit-adapter-aws-pulumi/compare/v1.3.1...v1.3.2) (2023-04-17)


### Bug Fixes

* update copyfiles search path ([6361661](https://github.com/Data-Only-Greater/sveltekit-adapter-aws-pulumi/commit/6361661f854e0d285dededc98addf771d8faad19))

## [1.3.1](https://github.com/Data-Only-Greater/sveltekit-adapter-aws-pulumi/compare/v1.3.0...v1.3.1) (2023-04-17)


### Bug Fixes

* try to see why semantic release is skipping files ([6e44432](https://github.com/Data-Only-Greater/sveltekit-adapter-aws-pulumi/commit/6e44432f4a3f79915eabb5ea58308566147bb417))

# [1.3.0](https://github.com/Data-Only-Greater/sveltekit-adapter-aws-pulumi/compare/v1.2.0...v1.3.0) (2023-04-17)


### Features

* secure access to lambda functions ([#2](https://github.com/Data-Only-Greater/sveltekit-adapter-aws-pulumi/issues/2)) ([e42de43](https://github.com/Data-Only-Greater/sveltekit-adapter-aws-pulumi/commit/e42de434d849580f4ecd69a2a4c1574ccfa7f235))

# [1.2.0](https://github.com/Data-Only-Greater/sveltekit-adapter-aws-pulumi/compare/v1.1.0...v1.2.0) (2023-04-14)


### Bug Fixes

* add defaultRootObject to distribution if index.html is a static route ([c1da38e](https://github.com/Data-Only-Greater/sveltekit-adapter-aws-pulumi/commit/c1da38e9ca6d22294a083c34a3c6ef1b9f903803))
* call refresh when destroying stack to adapt to drift ([d3fbb2f](https://github.com/Data-Only-Greater/sveltekit-adapter-aws-pulumi/commit/d3fbb2f643c64a1cef504646f86de8e292e5087c))
* don't remove build directory in case of pulumi failure ([6806dda](https://github.com/Data-Only-Greater/sveltekit-adapter-aws-pulumi/commit/6806dda722d40d2135c7d2b360f72a9671e9f0ea))
* finish fixing tests ([7031aad](https://github.com/Data-Only-Greater/sveltekit-adapter-aws-pulumi/commit/7031aadb731e09766c77691ecfe6752866ce76de))


### Features

* deploy using lambda@edge ([8573c5f](https://github.com/Data-Only-Greater/sveltekit-adapter-aws-pulumi/commit/8573c5f8887b00462159cf4ee369a2d077d8b282))

# [1.1.0](https://github.com/Data-Only-Greater/sveltekit-adapter-aws-pulumi/compare/v1.0.8...v1.1.0) (2023-04-03)


### Bug Fixes

* fix method for loading adapterprops in destroy script ([8a38ce5](https://github.com/Data-Only-Greater/sveltekit-adapter-aws-pulumi/commit/8a38ce5d362bb5127110e0f266c14508cda5a0ae))
* fix serialization of folder-hash for invalidation resource ([25f8cd6](https://github.com/Data-Only-Greater/sveltekit-adapter-aws-pulumi/commit/25f8cd689baff098d684665886606fe8283d988b))
* try to fix failure to remove build dir on linux ([4d1d988](https://github.com/Data-Only-Greater/sveltekit-adapter-aws-pulumi/commit/4d1d98876e8dc13ca7eeb5e740c61b11ac9a59ed))


### Features

* remove build directory after destroy ([b6bf67f](https://github.com/Data-Only-Greater/sveltekit-adapter-aws-pulumi/commit/b6bf67febf26e73d654b9304bb34adb9b2b90853))

## [1.0.8](https://github.com/Data-Only-Greater/sveltekit-adapter-aws-pulumi/compare/v1.0.7...v1.0.8) (2023-04-03)


### Bug Fixes

* fix duplicate name for Options handler RPA ([9e20f77](https://github.com/Data-Only-Greater/sveltekit-adapter-aws-pulumi/commit/9e20f77bb9ee0deb0ed2ecdb7d509c150567a318))
* unit test destroy script and replace shebang ([7418a49](https://github.com/Data-Only-Greater/sveltekit-adapter-aws-pulumi/commit/7418a492fecd67fb2dc8ab8c34f6542e88e84654))

## [1.0.7](https://github.com/Data-Only-Greater/sveltekit-adapter-aws-pulumi/compare/v1.0.6...v1.0.7) (2023-04-03)


### Bug Fixes

* ensure OriginRequestPolicy names are valid ([c80ec19](https://github.com/Data-Only-Greater/sveltekit-adapter-aws-pulumi/commit/c80ec19c68519e7c92805c3a225f9e7bcd8b8f5c))

## [1.0.6](https://github.com/Data-Only-Greater/sveltekit-adapter-aws-pulumi/compare/v1.0.5...v1.0.6) (2023-04-01)


### Bug Fixes

* fixed duplicate resource names ([389a06d](https://github.com/Data-Only-Greater/sveltekit-adapter-aws-pulumi/commit/389a06d3cf373523159928ceba52f4a2e44b0ee8))

## [1.0.5](https://github.com/Data-Only-Greater/sveltekit-adapter-aws-pulumi/compare/v1.0.4...v1.0.5) (2023-03-31)


### Bug Fixes

* install packages required for pulumi deploy ([fd14ddb](https://github.com/Data-Only-Greater/sveltekit-adapter-aws-pulumi/commit/fd14ddbcde5dc1dfd63be1cbd5425c7a65198b6d))

## [1.0.4](https://github.com/Data-Only-Greater/sveltekit-adapter-aws-pulumi/compare/v1.0.3...v1.0.4) (2023-03-30)


### Bug Fixes

* fix ESM module issues not picked up by test suite ([bfd23d6](https://github.com/Data-Only-Greater/sveltekit-adapter-aws-pulumi/commit/bfd23d6993551d5932009518c157c8fb3b2fbc86))

## [1.0.2](https://github.com/Data-Only-Greater/sveltekit-adapter-aws-pulumi/compare/v1.0.1...v1.0.2) (2023-03-28)


### Bug Fixes

* run semantic release from local installation ([f8632c4](https://github.com/Data-Only-Greater/sveltekit-adapter-aws-pulumi/commit/f8632c449f2f3bed5564514658fa6763b022fa36))
* try publish without yarn ([9648338](https://github.com/Data-Only-Greater/sveltekit-adapter-aws-pulumi/commit/9648338c8f65a3e4281cf1bfd020f06460f7710a))
* try using always-auth with setup-node ([14d02ca](https://github.com/Data-Only-Greater/sveltekit-adapter-aws-pulumi/commit/14d02cadd144f376c9b176f62d45f5395a35b0c5))

## [1.0.1](https://github.com/Data-Only-Greater/sveltekit-adapter-aws-pulumi/compare/v1.0.0...v1.0.1) (2023-03-28)


### Bug Fixes

* only publish dist folder ([4902397](https://github.com/Data-Only-Greater/sveltekit-adapter-aws-pulumi/commit/4902397340878702748abe4b13979d4baf5e3e45))

# 1.0.0 (2023-03-28)


### Features

* add semantic release workflow ([e14e41e](https://github.com/Data-Only-Greater/sveltekit-adapter-aws-pulumi/commit/e14e41ef67246bc386b5cf7a20a1e2e950456595))