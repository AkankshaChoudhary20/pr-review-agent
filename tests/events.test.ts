import {test} from 'node:test';
import assert from 'node:assert/strict';
import {isReviewableEvent} from '../src/reviewService.js';
const valid = {action:'opened', number:1, pull_request:{number:1,title:'Fix',html_url:'https://github.com/o/r/pull/1'},repository:{name:'r',full_name:'o/r',owner:{login:'o'}}};
test('complete supported PR events are accepted',()=>{
  assert.equal(isReviewableEvent('pull_request',valid),true);
  assert.equal(isReviewableEvent('pull_request',{...valid,action:'synchronize'}),true);
});
test('incomplete signed payloads cannot enter the review pipeline',()=>{
  for(const payload of [null,[],{action:'opened'},{...valid,pull_request:null},{...valid,repository:{}},{...valid,number:0},{...valid,pull_request:{...valid.pull_request,number:2}},{...valid,repository:{...valid.repository,owner:null}}])
    assert.equal(isReviewableEvent('pull_request',payload),false);
  assert.equal(isReviewableEvent('push',valid),false);
  assert.equal(isReviewableEvent('pull_request',{...valid,action:'closed'}),false);
});
