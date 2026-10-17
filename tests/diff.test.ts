import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {Octokit} from '@octokit/rest';
import {fetchPullRequestDiff} from '../src/github.js';
const client=(data:unknown)=>({rest:{pulls:{get:async()=>({data})}}}) as unknown as Octokit;
test('diff responses must contain text before entering the review pipeline',async()=>{
 for(const data of [{title:'PR'},null,[],42])await assert.rejects(fetchPullRequestDiff(client(data),'owner','repo',1),/non-text/);
 assert.equal(await fetchPullRequestDiff(client('diff --git a/a b/a'),'owner','repo',1),'diff --git a/a b/a');
 assert.equal(await fetchPullRequestDiff(client(''),'owner','repo',1),'');
});
