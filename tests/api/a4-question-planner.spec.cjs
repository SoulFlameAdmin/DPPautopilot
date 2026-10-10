'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {questionPlan}=require('../../api/_ai_question_planner.js');
test('fallback never publishes',()=>assert.equal(questionPlan().can_publish,false));
