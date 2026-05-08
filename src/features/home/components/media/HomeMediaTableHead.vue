<template>
  <div class="media-table-head">
    <span class="col-index">#</span>
    <span class="col-title">标题</span>
    <span class="col-album">专辑</span>
    <span class="col-duration">时长</span>
  </div>
</template>

<style scoped>
.media-table-head {
  display: grid;
  grid-template-columns: 40px minmax(0, 2fr) minmax(120px, 1.3fr) 64px;
  gap: 14px;
  align-items: center;
  padding: 8px 12px;
  color: var(--gray);
  font-size: 12px;
  font-weight: 700;
}

.col-index,
.col-duration {
  text-align: center;
}

@media (max-width: 760px) {
  .media-table-head {
    grid-template-columns: 38px minmax(0, 1fr) 56px;
  }

  .col-album {
    display: none;
  }
}
</style>
