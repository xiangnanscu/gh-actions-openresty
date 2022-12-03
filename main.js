
const core = require("@actions/core")
const exec = require("@actions/exec")
const io = require("@actions/io")
const tc = require("@actions/tool-cache")
const cache = require("@actions/cache")

const notice = (msg) => core.notice(`gh-actions-openresty: ${msg}`)
const warning = (msg) => core.warning(`gh-actions-openresty: ${msg}`)

const path = require("path")

const BUILD_PREFIX = ".openresty"

const makeCacheKey = (openrestyVersion, configureFlags) => `openresty:${openrestyVersion}:${process.platform}:${process.arch}:${configureFlags}`

const main = async () => {
  const openrestyVersion = core.getInput('openrestyVersion', { required: true })
  const configureFlags = core.getInput('configureFlags')
  const cacheDir = path.join(process.cwd(), BUILD_PREFIX)
  const extractPath = path.join(cacheDir, `openresty-${openrestyVersion}`)
  const opensslPath = path.join(cacheDir, 'openssl')
  const cachePaths = [BUILD_PREFIX]
  const cacheKey = makeCacheKey(openrestyVersion, configureFlags || "")

  let restoredCache = null

  if (core.getInput('buildCache') == 'true') {
    restoredCache = await cache.restoreCache(cachePaths, cacheKey)
    if (restoredCache) {
      notice(`Cache restored: ${restoredCache}`)
    } else {
      notice(`No cache available, clean build`)
    }
  }

  if (!restoredCache) {
    const sourceTar = await tc.downloadTool(`https://openresty.org/download/openresty-${openrestyVersion}.tar.gz`)

    await io.mkdirP(extractPath)
    await io.mkdirP(opensslPath)
    await tc.extractTar(sourceTar, BUILD_PREFIX)
    await exec.exec(`git clone --depth=1 https://github.com/openresty/lua-nginx-module.git`, undefined, {
      cwd: opensslPath
    })
    await exec.exec(`git clone --depth=1 https://github.com/openresty/stream-lua-nginx-module.git`, undefined, {
      cwd: opensslPath
    })
    await exec.exec(`git clone --depth=1 https://github.com/openresty/lua-resty-openssl-aux-module.git`, undefined, {
      cwd: opensslPath
    })
    let finalConfigureFlags = `-j4 --add-module=${opensslPath}/lua-resty-openssl-aux-module --add-module=${opensslPath}/lua-resty-openssl-aux-module/stream`
    if (configureFlags) {
      finalConfigureFlags = `${finalConfigureFlags} ${configureFlags}`
    }
    notice(`opensslPath:${opensslPath}, finalConfigureFlags:${finalConfigureFlags}`)
    await exec.exec(`ls`, [cacheDir])
    await exec.exec(`./configure`, finalConfigureFlags, {
      cwd: extractPath
    })

    await exec.exec(`make`, ["-j"], {
      cwd: extractPath
    })
  }

  await exec.exec(`sudo make install`, undefined, {
    cwd: extractPath
  })

  if (core.getInput('buildCache') == 'true' && !restoredCache) {
    notice(`Storing into cache: ${cacheKey}`)
    try {
      await cache.saveCache(cachePaths, cacheKey)
    } catch (e) {
      warning(`Failed to save to cache (continuing anyway): ${e}`)
    }
  }

  core.addPath("/usr/local/openresty/bin")


  await exec.exec(`rm -rf `, [BUILD_PREFIX], {
    cwd: extractPath
  })


  // TODO: delete the .openresty folder
}


main().catch(err => {
  core.setFailed(`Failed to install OpenResty: ${err}`);
})
