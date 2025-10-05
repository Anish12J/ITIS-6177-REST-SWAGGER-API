exports.sayFunction = (request, response) => {
  const keyword = request.query.keyword
  response.send(`Anish says ${keyword}`);
};
