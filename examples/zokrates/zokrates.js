const { getClient, SHARED_DATA } = require('../../dist/index.js')
const fs = require('fs')
const path = require('path')

const log = async prom => {
  const logs = await prom
  logs.forEach(log => {
    console.log(log)
  });
}

// see https://zokrates.github.io/gettingstarted.html#hello-zokrates
const run = async () => {
  const zokrates = await getClient('zokrates')
  fs.writeFileSync(path.join(__dirname, 'test.zok'), `
  def main(private field a, field b) -> (field):
    field result = if a * a == b then 1 else 0 fi
    return result
  `)
  await log(zokrates.execute(`compile -i ${SHARED_DATA}/test.zok`))
  await log(zokrates.execute(`setup`))
  await log(zokrates.execute('compute-witness -a 337 113569'))
  await log(zokrates.execute('generate-proof'))
  await log(zokrates.execute(`export-verifier`))
  await log(zokrates.execute(`cp ./verifier.sol ${SHARED_DATA}`, { useBash: true, useEntrypoint: false }))

  await zokrates.stop()
}
run()