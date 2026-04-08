function handler(event) {
    var request = event.request;
    var uri = request.uri;
    if (uri.includes('.')) {
        return request;
    }
    request.uri = '/index.html';
    return request;
}
