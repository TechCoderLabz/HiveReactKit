// Run: npx tsx src/utils/postVotes.test.ts
import assert from 'node:assert/strict'
import {
  CURATION_REQUEST_ONLY_ACCOUNTS,
  RESTRICTED_DIRECT_VOTE_ACCOUNTS,
  isRestrictedDirectVoter,
} from './postVotes'

assert.deepEqual(
  [...CURATION_REQUEST_ONLY_ACCOUNTS],
  ['sagarkothari88', 'hivesuite.app', 'letusbuyhive'],
)

assert.ok(RESTRICTED_DIRECT_VOTE_ACCOUNTS.size === CURATION_REQUEST_ONLY_ACCOUNTS.length)
for (const name of CURATION_REQUEST_ONLY_ACCOUNTS) {
  assert.ok(RESTRICTED_DIRECT_VOTE_ACCOUNTS.has(name))
}

assert.equal(isRestrictedDirectVoter('sagarkothari88'), true)
assert.equal(isRestrictedDirectVoter('SagarKothari88'), true)
assert.equal(isRestrictedDirectVoter('hivesuite.app'), true)
assert.equal(isRestrictedDirectVoter('HiveSuite.App'), true)
assert.equal(isRestrictedDirectVoter('letusbuyhive'), true)
assert.equal(isRestrictedDirectVoter('alice'), false)
assert.equal(isRestrictedDirectVoter(''), false)
assert.equal(isRestrictedDirectVoter(null), false)
assert.equal(isRestrictedDirectVoter(undefined), false)

console.log('postVotes restricted-voter list: 11/11 passed')
