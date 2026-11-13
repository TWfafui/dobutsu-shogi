import {chooseMove} from './engine.js?v=14';

self.addEventListener('message', ({data}) => {
  const {id,state,level} = data;
  try {
    self.postMessage({id,...chooseMove(state,level)});
  } catch (error) {
    self.postMessage({id,error:error instanceof Error ? error.message : String(error)});
  }
});
