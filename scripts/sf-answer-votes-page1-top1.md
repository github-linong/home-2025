# SegmentFault Answers (votes) - Page 1 Top 1

- Source page: https://segmentfault.com/u/linong/answers?sort=votes
- Answer URL: https://segmentfault.com/q/1010000040137996/a-1020000040138625
- Question: js 对象数组排序+去重问题
- Answer author: linong
- Votes (useful): 11
- Answer publish date: 2021-06-08

## Extracted answer content

这是单纯的去重复

你可以使用排序来完成时间操作。

当然了，你也可以把重复再去比较时间的逻辑加在 reduce 里面

```js
[
  {
    name: '玉骨遥寒薇结海报',
    created_at: '2021-06-04 04:54:06.164',
  },
  {
    name: '玉骨遥寒薇结海报',
    created_at: '2021-06-04 04:52:49.753',
  },
  {
    name: '玉骨遥寒薇结海报',
    created_at: '2021-06-04 05:02:02.398',
  },
  {
    name: '公交车抛锚警民携手推车为考生开路',
    created_at: '2021-06-04 04:52:40.588',
  },
  {
    name: '公交车抛锚警民携手推车为考生开路',
    created_at: '2021-06-04 05:07:21.587',
  },
].reduce(function(s,v){
  var itemIdx = s.findIndex(v1=>v1.name==v.name);
  if(itemIdx == -1){
    s.push(v)
  }else{
    var item = s[itemIdx];
    if(v.created_at < item.created_at){
      s.splice(itemIdx,1,v)
    }
  }
  return s
},[])
```
